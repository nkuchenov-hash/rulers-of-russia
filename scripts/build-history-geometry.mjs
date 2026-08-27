import fs from 'node:fs';
import path from 'node:path';
import { geoInterpolate } from 'd3-geo';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'geometry-recipes');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const recipeFiles = fs.existsSync(recipeRoot)
  ? fs.readdirSync(recipeRoot).filter(name => name.endsWith('.json')).sort().map(name => path.join(recipeRoot, name))
  : [];
const recipes = recipeFiles.flatMap(file => readJson(file).recipes ?? []);

const assert = (ok, message) => { if (!ok) throw new Error(message); };
const seenIds = new Set();
const seenOutputs = new Set();

const finitePoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
  && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90;
const samePoint = (a, b, eps = 1e-10) => Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const displayDatumStatus = recipe => /\bWGS\s*-?\s*84\b/i.test(String(recipe.sourceCrs ?? ''))
  ? 'wgs84-or-official-wgs84-recalculation'
  : 'source-geographic-untransformed';

function geodesicSegment(a, b, steps) {
  const interp = geoInterpolate(a, b);
  const out = [a];
  for (let i = 1; i < steps; i += 1) out.push(interp(i / steps));
  out.push(b);
  return out;
}

const rad = d => d * Math.PI / 180;
const deg = r => r * 180 / Math.PI;
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + rad(Math.max(-89.999999, Math.min(89.999999, lat))) / 2));
const invMercY = y => deg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

function rhumbSegment(a, b, steps) {
  let lonA = a[0];
  let lonB = b[0];
  const delta = lonB - lonA;
  if (delta > 180) lonB -= 360;
  if (delta < -180) lonB += 360;
  const yA = mercY(a[1]);
  const yB = mercY(b[1]);
  const out = [a];
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    let lon = lonA + (lonB - lonA) * t;
    while (lon > 180) lon -= 360;
    while (lon < -180) lon += 360;
    out.push([lon, invMercY(yA + (yB - yA) * t)]);
  }
  out.push(b);
  return out;
}

function materializePoints(recipe) {
  if (recipe.interpolation === 'source-vertices') return recipe.points.map(point => [...point]);
  const steps = Math.max(1, Number(recipe.stepsPerSegment ?? 8));
  const out = [];
  for (let i = 0; i < recipe.points.length - 1; i += 1) {
    const a = recipe.points[i];
    const b = recipe.points[i + 1];
    const segment = recipe.interpolation === 'geodesic'
      ? geodesicSegment(a, b, steps)
      : recipe.interpolation === 'rhumb'
        ? rhumbSegment(a, b, steps)
        : null;
    assert(segment, `Unsupported interpolation ${recipe.interpolation} in ${recipe.id}`);
    if (out.length && samePoint(out[out.length - 1], segment[0])) segment.shift();
    out.push(...segment);
  }
  return out;
}

for (const recipe of recipes) {
  assert(recipe?.id && !seenIds.has(recipe.id), `Duplicate or missing geometry recipe id: ${recipe?.id}`);
  seenIds.add(recipe.id);
  assert(recipe?.fragmentId, `Geometry recipe ${recipe.id} has no fragmentId`);
  assert(recipe?.output && !seenOutputs.has(recipe.output), `Duplicate or missing output in ${recipe.id}`);
  seenOutputs.add(recipe.output);
  assert(['russian-legal-border', 'maritime-jurisdiction', 'de-facto-control', 'front-line', 'internal-administrative', 'claim'].includes(recipe.track), `Invalid track in ${recipe.id}`);
  assert(['geodesic', 'rhumb', 'source-vertices'].includes(recipe.interpolation), `Invalid interpolation in ${recipe.id}`);
  assert(Array.isArray(recipe.evidenceDocumentIds) && recipe.evidenceDocumentIds.length > 0, `Recipe ${recipe.id} has no evidence documents`);
  assert(Array.isArray(recipe.points) && recipe.points.length >= 2 && recipe.points.every(finitePoint), `Invalid source points in ${recipe.id}`);

  const coordinates = materializePoints(recipe);
  for (const sourcePoint of recipe.points) {
    assert(coordinates.some(point => samePoint(point, sourcePoint, 1e-8)), `Generated ${recipe.id} lost a treaty source point ${JSON.stringify(sourcePoint)}`);
  }

  const datumStatus = displayDatumStatus(recipe);
  const outputFile = path.join(dataRoot, recipe.output);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  const payload = {
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Rulers of Russia History Core generated verified geometry',
      recipeId: recipe.id,
      fragmentId: recipe.fragmentId,
      generatedFromSourceCoordinates: true,
      sourceCrs: recipe.sourceCrs ?? 'unspecified',
      displayDatumStatus: datumStatus,
      displayWarning: datumStatus === 'source-geographic-untransformed'
        ? 'Source longitude/latitude values are retained literally for provenance. Their exact placement on a WGS84 globe remains medium-confidence until a source-backed datum transformation is registered.'
        : null,
      interpolation: recipe.interpolation,
      evidenceDocumentIds: recipe.evidenceDocumentIds,
      sourcePointCount: recipe.points.length,
      note: recipe.note ?? null
    },
    features: [{
      type: 'Feature',
      properties: {
        id: recipe.fragmentId,
        track: recipe.track,
        history_core_status: 'geometry-verified',
        source_points: recipe.points,
        source_crs: recipe.sourceCrs ?? 'unspecified',
        display_datum_status: datumStatus,
        interpolation: recipe.interpolation,
        evidence_document_ids: recipe.evidenceDocumentIds,
        note: recipe.note ?? null
      },
      geometry: { type: 'LineString', coordinates }
    }]
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + '\n');
}

console.log(`History geometry materialized from recipes: ${recipes.length} verified coordinate lines.`);
