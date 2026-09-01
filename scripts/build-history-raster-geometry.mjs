import fs from 'node:fs';
import path from 'node:path';
import {materializeRasterGeometry, rasterTraceSourcePoints, transformRasterPoint, validateRasterGeoreference} from './lib/raster-georeference.mjs';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'raster-geometry-recipes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const files = fs.existsSync(recipeRoot)
  ? fs.readdirSync(recipeRoot).filter(name => name.endsWith('.json')).sort().map(name => path.join(recipeRoot, name))
  : [];
const recipes = files.flatMap(file => readJson(file).recipes ?? []);
const allowedTracks = new Set(['russian-legal-border', 'maritime-jurisdiction', 'de-facto-control', 'front-line', 'internal-administrative', 'claim']);
const allowedTypes = new Set(['LineString', 'MultiPoint', 'Polygon', 'MultiPolygon']);
const seenIds = new Set();
const seenOutputs = new Set();
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function validatePixelShape(recipe, geometryType) {
  const finitePixel = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
  const validPath = pathValue => Array.isArray(pathValue) && pathValue.length >= 2 && pathValue.every(finitePixel);
  const validRing = ring => Array.isArray(ring) && ring.length >= 3 && ring.every(finitePixel);
  if (geometryType === 'LineString' || geometryType === 'MultiPoint') {
    assert(validPath(recipe.pixelPoints), `Raster recipe ${recipe.id} has invalid pixelPoints`);
    return;
  }
  if (geometryType === 'Polygon') {
    assert(Array.isArray(recipe.pixelRings) && recipe.pixelRings.length > 0 && recipe.pixelRings.every(validRing), `Raster recipe ${recipe.id} has invalid pixelRings`);
    return;
  }
  assert(Array.isArray(recipe.pixelPolygons) && recipe.pixelPolygons.length > 0, `Raster recipe ${recipe.id} has no pixelPolygons`);
  for (const polygon of recipe.pixelPolygons) assert(Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing), `Raster recipe ${recipe.id} has invalid pixelPolygons`);
}

for (const recipe of recipes) {
  assert(recipe?.id && !seenIds.has(recipe.id), `Duplicate or missing raster geometry recipe id ${recipe?.id}`);
  seenIds.add(recipe.id);
  assert(recipe?.fragmentId, `Raster recipe ${recipe.id} has no fragmentId`);
  assert(recipe?.output && !seenOutputs.has(recipe.output), `Duplicate or missing raster output in ${recipe.id}`);
  seenOutputs.add(recipe.output);
  assert(allowedTracks.has(recipe.track), `Invalid track in raster recipe ${recipe.id}`);
  const geometryType = recipe.geometryType ?? 'Polygon';
  assert(allowedTypes.has(geometryType), `Invalid geometry type in raster recipe ${recipe.id}`);
  assert(Array.isArray(recipe.evidenceDocumentIds) && recipe.evidenceDocumentIds.length > 0, `Raster recipe ${recipe.id} has no evidence documents`);
  assert(recipe.sourceRaster?.url, `Raster recipe ${recipe.id} has no source raster URL`);
  validateRasterGeoreference(recipe.georeference, recipe.sourceRaster);
  validatePixelShape(recipe, geometryType);

  const sourcePixels = rasterTraceSourcePoints(recipe, geometryType);
  const transformedSourcePoints = sourcePixels.map(pixel => transformRasterPoint(pixel, recipe.georeference, recipe.sourceRaster).lonLat);
  const geometry = materializeRasterGeometry(recipe, geometryType);
  const outputFile = path.join(dataRoot, recipe.output);
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  const payload = {
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Rulers of Russia History Core generated raster-georeferenced geometry',
      recipeId: recipe.id,
      fragmentId: recipe.fragmentId,
      generatedFromRasterGeoreference: true,
      generatedFromSourceCoordinates: false,
      sourceRasterUrl: recipe.sourceRaster.url,
      sourceRasterSha256: recipe.sourceRaster.sha256,
      sourceRasterWidth: recipe.sourceRaster.width,
      sourceRasterHeight: recipe.sourceRaster.height,
      georeferenceMethod: recipe.georeference.method,
      displayDatumStatus: 'wgs84-from-explicit-raster-georeference',
      geometryType,
      gcpCount: recipe.georeference.gcps.length,
      triangleCount: recipe.georeference.triangles.length,
      uncertaintyKm: recipe.georeference.uncertaintyKm,
      evidenceDocumentIds: recipe.evidenceDocumentIds,
      tracedPixelCount: sourcePixels.length,
      note: recipe.note ?? null
    },
    features: [{
      type: 'Feature',
      properties: {
        id: recipe.fragmentId,
        track: recipe.track,
        history_core_status: 'geometry-verified',
        derivation_mode: 'raster-georeferenced-trace',
        source_raster_url: recipe.sourceRaster.url,
        source_raster_sha256: recipe.sourceRaster.sha256,
        georeference_method: recipe.georeference.method,
        georeference_gcps: recipe.georeference.gcps,
        georeference_triangles: recipe.georeference.triangles,
        uncertainty_km: recipe.georeference.uncertaintyKm,
        source_pixel_points: sourcePixels,
        transformed_source_points: transformedSourcePoints,
        evidence_document_ids: recipe.evidenceDocumentIds,
        note: recipe.note ?? null
      },
      geometry
    }]
  };
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + '\n');
}

console.log(`History raster geometry materialized: ${recipes.length} reproducible map-derived geometries.`);
