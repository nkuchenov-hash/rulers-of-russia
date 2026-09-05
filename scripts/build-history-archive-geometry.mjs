import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import polygonClipping from 'polygon-clipping';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'archive-geometry-recipes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const recipeFiles = fs.existsSync(recipeRoot)
  ? fs.readdirSync(recipeRoot).filter(name => name.endsWith('.json')).sort().map(name => path.join(recipeRoot, name))
  : [];
const recipes = recipeFiles.flatMap(file => readJson(file).recipes ?? []);
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function gitBlobSha1(bytes) {
  const prefix = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(prefix).update(bytes).digest('hex');
}

function ringContains(point, ring) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContains(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0 || !ringContains(point, polygon[0])) return false;
  return !polygon.slice(1).some(hole => ringContains(point, hole));
}

function geometryContains(point, geometry) {
  if (geometry?.type === 'Polygon') return polygonContains(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(polygon => polygonContains(point, polygon));
  return false;
}

function matchesSelector(feature, selector) {
  const props = feature?.properties ?? {};
  return Object.entries(selector ?? {}).every(([key, value]) => String(props[key] ?? '') === String(value));
}

function geometryPolygons(geometry) {
  if (geometry?.type === 'Polygon') return [geometry.coordinates];
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

for (const recipe of recipes) {
  assert(recipe?.id && recipe?.fragmentId && recipe?.archivePath && recipe?.archiveBlobSha1 && (recipe?.selector || Array.isArray(recipe?.featureIndices)) && recipe?.output, `Incomplete archive geometry recipe ${recipe?.id ?? '<missing>'}`);
  assert(Array.isArray(recipe.evidenceDocumentIds) && recipe.evidenceDocumentIds.length > 0, `Archive geometry recipe ${recipe.id} has no evidence documents`);
  const archiveFile = path.join(root, recipe.archivePath);
  assert(fs.existsSync(archiveFile), `Archive geometry recipe ${recipe.id} source missing: ${recipe.archivePath}`);
  const bytes = fs.readFileSync(archiveFile);
  const digest = gitBlobSha1(bytes);
  assert(digest === recipe.archiveBlobSha1, `Archive geometry recipe ${recipe.id} blob SHA mismatch: expected ${recipe.archiveBlobSha1}, got ${digest}`);
  const archive = JSON.parse(bytes.toString('utf8'));
  let candidates;
  if (Array.isArray(recipe.featureIndices)) {
    const all = archive.features ?? [];
    candidates = recipe.featureIndices.map(index => {
      assert(Number.isInteger(index) && index >= 0 && index < all.length, `Archive geometry recipe ${recipe.id} feature index ${index} is out of range`);
      return all[index];
    });
  } else {
    candidates = (archive.features ?? []).filter(feature => matchesSelector(feature, recipe.selector));
  }
  assert(candidates.length >= 1, `Archive geometry recipe ${recipe.id} selected no features`);
  for (const feature of candidates) {
    assert(['Polygon', 'MultiPolygon'].includes(feature.geometry?.type), `Archive geometry recipe ${recipe.id} selected unsupported geometry ${feature.geometry?.type}`);
  }
  let polygons = candidates.flatMap(feature => geometryPolygons(feature.geometry));
  if (recipe.componentBboxFilter) {
    const f = recipe.componentBboxFilter;
    assert([f.minLon,f.minLat,f.maxLon,f.maxLat].every(Number.isFinite), `Archive geometry recipe ${recipe.id} has invalid componentBboxFilter`);
    const polygonBbox = polygon => {
      const pts = polygon.flat();
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    };
    polygons = polygons.filter(polygon => {
      const [minX,minY,maxX,maxY] = polygonBbox(polygon);
      return minX >= f.minLon && minY >= f.minLat && maxX <= f.maxLon && maxY <= f.maxLat;
    });
    assert(polygons.length >= 1, `Archive geometry recipe ${recipe.id} componentBboxFilter selected no polygon components`);
  }

  const appliedDifferenceMasks = [];
  for (const mask of recipe.differenceMasks ?? []) {
    assert(mask?.archivePath && mask?.archiveBlobSha1 && mask?.selector, `Archive geometry recipe ${recipe.id} has incomplete difference mask`);
    const maskFile = path.join(root, mask.archivePath);
    assert(fs.existsSync(maskFile), `Archive geometry recipe ${recipe.id} difference mask source missing: ${mask.archivePath}`);
    const maskBytes = fs.readFileSync(maskFile);
    const maskDigest = gitBlobSha1(maskBytes);
    assert(maskDigest === mask.archiveBlobSha1, `Archive geometry recipe ${recipe.id} difference mask blob SHA mismatch: expected ${mask.archiveBlobSha1}, got ${maskDigest}`);
    const maskArchive = JSON.parse(maskBytes.toString('utf8'));
    const maskFeatures = (maskArchive.features ?? []).filter(feature => matchesSelector(feature, mask.selector));
    if (mask.expectedFeatureCount != null) {
      assert(maskFeatures.length === Number(mask.expectedFeatureCount), `Archive geometry recipe ${recipe.id} difference mask expected ${mask.expectedFeatureCount} features, got ${maskFeatures.length}`);
    } else {
      assert(maskFeatures.length >= 1, `Archive geometry recipe ${recipe.id} difference mask selected no features`);
    }
    const maskPolygons = maskFeatures.flatMap(feature => geometryPolygons(feature.geometry));
    assert(maskPolygons.length >= 1, `Archive geometry recipe ${recipe.id} difference mask has no polygon geometry`);
    polygons = polygonClipping.difference(polygons, ...maskPolygons);
    assert(Array.isArray(polygons) && polygons.length >= 1, `Archive geometry recipe ${recipe.id} difference mask removed all geometry`);
    appliedDifferenceMasks.push({
      archivePath: mask.archivePath,
      archiveBlobSha1: mask.archiveBlobSha1,
      selector: mask.selector,
      expectedFeatureCount: mask.expectedFeatureCount ?? null,
      note: mask.note ?? null,
    });
  }

  const sourceGeometry = {type:'MultiPolygon', coordinates:polygons};

  for (const control of recipe.controls ?? []) {
    assert(Array.isArray(control.lonLat) && control.lonLat.length === 2 && control.lonLat.every(Number.isFinite), `Archive geometry recipe ${recipe.id} has invalid control ${control.id}`);
    const inside = geometryContains(control.lonLat, sourceGeometry);
    const expected = control.expected === 'inside';
    assert(inside === expected, `Archive geometry recipe ${recipe.id} control ${control.id} expected ${control.expected}, got ${inside ? 'inside' : 'outside'}`);
  }

  const outputFile = path.join(dataRoot, recipe.output);
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  const payload = {
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Rulers of Russia History Core corroborated archive geometry',
      recipeId: recipe.id,
      fragmentId: recipe.fragmentId,
      generatedFromCorroboratedArchive: true,
      archivePath: recipe.archivePath,
      archiveBlobSha1: recipe.archiveBlobSha1,
      selector: recipe.selector ?? null,
      featureIndices: recipe.featureIndices ?? null,
      componentBboxFilter: recipe.componentBboxFilter ?? null,
      differenceMasks: appliedDifferenceMasks,
      sourceCrs: recipe.sourceCrs ?? 'RFC 7946 longitude/latitude',
      evidenceDocumentIds: recipe.evidenceDocumentIds,
      independentControls: recipe.controls ?? [],
      note: recipe.note ?? null,
    },
    features: [{
      type: 'Feature',
      properties: {
        id: recipe.fragmentId,
        track: recipe.track,
        history_core_status: 'geometry-verified',
        archive_source_properties: candidates.map(feature => feature.properties ?? {}),
        evidence_document_ids: recipe.evidenceDocumentIds,
        corroboration_controls: recipe.controls ?? [],
        difference_masks: appliedDifferenceMasks,
        note: recipe.note ?? null,
      },
      geometry: sourceGeometry,
    }],
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + '\n');
}

console.log(`History archive geometry materialized: ${recipes.length} corroborated archive recipes.`);
