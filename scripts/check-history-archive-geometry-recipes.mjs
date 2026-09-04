import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'archive-geometry-recipes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => path.join(dir, name))
  : [];
const flatten = (files, key) => files.flatMap(file => readJson(file)[key] ?? []);
const fail = message => { throw new Error(message); };

const model = readJson(path.join(dataRoot, 'territory-model.json'));
const fragments = new Map((model.fragments ?? []).map(fragment => [fragment.id, fragment]));
const documents = [
  ...(readJson(path.join(dataRoot, 'documents.json')).documents ?? []),
  ...flatten(listJson(path.join(dataRoot, 'documents')), 'documents'),
];
const documentIds = new Set(documents.map(document => document.id));
const recipes = flatten(listJson(recipeRoot), 'recipes');

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
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
const polygonContains = (point, polygon) => Array.isArray(polygon) && polygon.length > 0 && ringContains(point, polygon[0]) && !polygon.slice(1).some(hole => ringContains(point, hole));
const geometryContains = (point, geometry) => geometry?.type === 'Polygon'
  ? polygonContains(point, geometry.coordinates)
  : geometry?.type === 'MultiPolygon' && geometry.coordinates.some(polygon => polygonContains(point, polygon));
const matchesSelector = (feature, selector) => Object.entries(selector ?? {}).every(([key, value]) => String(feature?.properties?.[key] ?? '') === String(value));

const seenIds = new Set();
const seenFragments = new Set();
const seenOutputs = new Set();
for (const recipe of recipes) {
  if (!recipe.id || seenIds.has(recipe.id)) fail(`Duplicate or missing archive recipe id ${recipe.id ?? '<missing>'}`);
  seenIds.add(recipe.id);
  if (!recipe.fragmentId || seenFragments.has(recipe.fragmentId)) fail(`Duplicate or missing archive recipe fragment ${recipe.fragmentId ?? '<missing>'}`);
  seenFragments.add(recipe.fragmentId);
  if (!recipe.output || seenOutputs.has(recipe.output)) fail(`Duplicate or missing archive recipe output ${recipe.output ?? '<missing>'}`);
  seenOutputs.add(recipe.output);

  const fragment = fragments.get(recipe.fragmentId);
  if (!fragment) fail(`Archive recipe ${recipe.id} targets unknown fragment ${recipe.fragmentId}`);
  if (fragment.reviewStatus !== 'geometry-verified') fail(`Archive recipe ${recipe.id} targets non-verified fragment ${recipe.fragmentId}`);
  if (fragment.geometryFile !== recipe.output) fail(`Archive recipe ${recipe.id} output differs from fragment ${recipe.fragmentId}`);
  if (fragment.track !== recipe.track) fail(`Archive recipe ${recipe.id} track differs from fragment ${recipe.fragmentId}`);
  if (!Array.isArray(recipe.evidenceDocumentIds) || recipe.evidenceDocumentIds.length === 0) fail(`Archive recipe ${recipe.id} has no evidence documents`);
  for (const id of recipe.evidenceDocumentIds) if (!documentIds.has(id)) fail(`Archive recipe ${recipe.id} references unknown document ${id}`);

  const archiveFile = path.join(root, recipe.archivePath ?? '');
  if (!fs.existsSync(archiveFile)) fail(`Archive recipe ${recipe.id} source missing: ${recipe.archivePath}`);
  const bytes = fs.readFileSync(archiveFile);
  const digest = gitBlobSha1(bytes);
  if (digest !== recipe.archiveBlobSha1) fail(`Archive recipe ${recipe.id} blob SHA mismatch: ${digest}`);
  const archive = JSON.parse(bytes.toString('utf8'));
  const allFeatures = archive.features ?? [];
  let candidates;
  if (Array.isArray(recipe.featureIndices)) {
    if (recipe.featureIndices.length === 0) fail(`Archive recipe ${recipe.id} has empty featureIndices`);
    const unique = new Set(recipe.featureIndices);
    if (unique.size !== recipe.featureIndices.length) fail(`Archive recipe ${recipe.id} has duplicate featureIndices`);
    candidates = recipe.featureIndices.map(index => {
      if (!Number.isInteger(index) || index < 0 || index >= allFeatures.length) fail(`Archive recipe ${recipe.id} feature index ${index} is out of range`);
      return allFeatures[index];
    });
  } else {
    if (!recipe.selector || typeof recipe.selector !== 'object') fail(`Archive recipe ${recipe.id} has neither selector nor featureIndices`);
    candidates = allFeatures.filter(feature => matchesSelector(feature, recipe.selector));
    if (candidates.length !== 1) fail(`Archive recipe ${recipe.id} selector matched ${candidates.length} features`);
  }
  if (candidates.length < 1) fail(`Archive recipe ${recipe.id} selected no features`);
  for (const sourceFeature of candidates) {
    if (!['Polygon', 'MultiPolygon'].includes(sourceFeature.geometry?.type)) fail(`Archive recipe ${recipe.id} selected unsupported geometry`);
  }
  let polygons = candidates.flatMap(sourceFeature => sourceFeature.geometry.type === 'Polygon'
    ? [sourceFeature.geometry.coordinates]
    : sourceFeature.geometry.coordinates);
  if (recipe.componentBboxFilter) {
    const f = recipe.componentBboxFilter;
    if (![f.minLon,f.minLat,f.maxLon,f.maxLat].every(Number.isFinite)) fail(`Archive recipe ${recipe.id} has invalid componentBboxFilter`);
    const polygonBbox = polygon => {
      const pts = polygon.flat();
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    };
    polygons = polygons.filter(polygon => {
      const [minX,minY,maxX,maxY] = polygonBbox(polygon);
      return minX >= f.minLon && minY >= f.minLat && maxX <= f.maxLon && maxY <= f.maxLat;
    });
    if (polygons.length < 1) fail(`Archive recipe ${recipe.id} componentBboxFilter selected no polygon components`);
  }
  const sourceGeometry = {type: 'MultiPolygon', coordinates: polygons};
  for (const control of recipe.controls ?? []) {
    if (!['inside', 'outside'].includes(control.expected)) fail(`Archive recipe ${recipe.id} control ${control.id} has invalid expectation`);
    if (!Array.isArray(control.lonLat) || control.lonLat.length !== 2 || !control.lonLat.every(Number.isFinite)) fail(`Archive recipe ${recipe.id} control ${control.id} has invalid lonLat`);
    const inside = geometryContains(control.lonLat, sourceGeometry);
    if (inside !== (control.expected === 'inside')) fail(`Archive recipe ${recipe.id} control ${control.id} expected ${control.expected}, got ${inside ? 'inside' : 'outside'}`);
  }

  const outputFile = path.join(dataRoot, recipe.output);
  if (!fs.existsSync(outputFile)) fail(`Archive recipe ${recipe.id} output missing: ${recipe.output}`);
  const generated = readJson(outputFile);
  if (generated.metadata?.recipeId !== recipe.id || generated.metadata?.generatedFromCorroboratedArchive !== true) fail(`Archive output ${recipe.output} is not tied to recipe ${recipe.id}`);
  if (generated.metadata?.archiveBlobSha1 !== recipe.archiveBlobSha1) fail(`Archive output ${recipe.output} lost source blob identity`);
  if (JSON.stringify(generated.features?.[0]?.geometry) !== JSON.stringify(sourceGeometry)) fail(`Archive output ${recipe.output} does not preserve exact selected geometry`);
  if (Array.isArray(recipe.featureIndices) && JSON.stringify(generated.metadata?.featureIndices) !== JSON.stringify(recipe.featureIndices)) fail(`Archive output ${recipe.output} lost selected feature indices`);
  if (JSON.stringify(generated.metadata?.componentBboxFilter ?? null) !== JSON.stringify(recipe.componentBboxFilter ?? null)) fail(`Archive output ${recipe.output} lost componentBboxFilter provenance`);
}

console.log(`History archive geometry recipe check passed: ${recipes.length} pinned/corroborated recipes.`);
