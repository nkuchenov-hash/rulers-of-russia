import fs from 'node:fs';
import path from 'node:path';
import {materializeRasterGeometry, rasterTraceSourcePoints, transformRasterPoint, validateRasterGeoreference} from './lib/raster-georeference.mjs';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'raster-geometry-recipes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => path.join(dir, name)) : [];
const flatten = (files, key) => files.flatMap(file => readJson(file)[key] ?? []);
const fail = message => { throw new Error(message); };
const finiteLonLat = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90;
const samePoint = (a, b, eps = 1e-8) => finiteLonLat(a) && finiteLonLat(b) && Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;

const model = readJson(path.join(dataRoot, 'territory-model.json'));
const fragments = new Map((model.fragments ?? []).map(fragment => [fragment.id, fragment]));
const rootDocuments = readJson(path.join(dataRoot, 'documents.json')).documents ?? [];
const modularDocuments = flatten(listJson(path.join(dataRoot, 'documents')), 'documents');
const documentIds = new Set([...rootDocuments, ...modularDocuments].map(document => document.id));
const recipes = flatten(listJson(recipeRoot), 'recipes');
const seenFragments = new Set();
const seenOutputs = new Set();
const commerciallyReusableRasterRights = new Set(['public-domain', 'cc0', 'cc-by', 'cc-by-sa', 'licensed-commercial', 'open-government-license']);

function flattenPoints(value, out = []) {
  if (finiteLonLat(value)) out.push(value);
  else if (Array.isArray(value)) for (const child of value) flattenPoints(child, out);
  return out;
}

for (const recipe of recipes) {
  if (!recipe.id || !recipe.fragmentId || !recipe.output) fail(`Incomplete raster geometry recipe ${recipe.id ?? '<missing>'}`);
  if (seenFragments.has(recipe.fragmentId)) fail(`Multiple raster recipes target ${recipe.fragmentId}`);
  if (seenOutputs.has(recipe.output)) fail(`Multiple raster recipes write ${recipe.output}`);
  seenFragments.add(recipe.fragmentId);
  seenOutputs.add(recipe.output);

  const fragment = fragments.get(recipe.fragmentId);
  if (!fragment) fail(`Raster recipe ${recipe.id} targets unknown fragment ${recipe.fragmentId}`);
  if (fragment.reviewStatus !== 'geometry-verified') fail(`Raster recipe ${recipe.id} targets non-verified fragment ${recipe.fragmentId}`);
  if (fragment.geometryFile !== recipe.output) fail(`Raster recipe ${recipe.id} output differs from fragment geometryFile`);
  if (fragment.track !== recipe.track) fail(`Raster recipe ${recipe.id} track differs from fragment track`);
  if (!Array.isArray(recipe.evidenceDocumentIds) || recipe.evidenceDocumentIds.length === 0) fail(`Raster recipe ${recipe.id} has no evidence documents`);
  for (const id of recipe.evidenceDocumentIds) if (!documentIds.has(id)) fail(`Raster recipe ${recipe.id} references unknown document ${id}`);
  if (!commerciallyReusableRasterRights.has(recipe.sourceRaster?.rightsStatus)) fail(`Raster recipe ${recipe.id} source rights are not explicitly reusable for production/commercial output`);
  if (!/^https:\/\//.test(recipe.sourceRaster?.rightsEvidenceUrl ?? '')) fail(`Raster recipe ${recipe.id} has no HTTPS rightsEvidenceUrl`);
  validateRasterGeoreference(recipe.georeference, recipe.sourceRaster);

  const outputFile = path.join(dataRoot, recipe.output);
  if (!fs.existsSync(outputFile)) fail(`Raster recipe output is missing: ${recipe.output}`);
  const generated = readJson(outputFile);
  if (generated.metadata?.recipeId !== recipe.id || generated.metadata?.generatedFromRasterGeoreference !== true) fail(`Raster output ${recipe.output} is not linked to ${recipe.id}`);
  if (generated.metadata?.sourceRasterSha256 !== recipe.sourceRaster.sha256) fail(`Raster output ${recipe.output} source hash mismatch`);
  if (generated.metadata?.sourceRasterRightsStatus !== recipe.sourceRaster.rightsStatus) fail(`Raster output ${recipe.output} source rights status mismatch`);
  if (generated.metadata?.sourceRasterRightsEvidenceUrl !== recipe.sourceRaster.rightsEvidenceUrl) fail(`Raster output ${recipe.output} source rights evidence mismatch`);
  if (generated.metadata?.georeferenceMethod !== recipe.georeference.method) fail(`Raster output ${recipe.output} georeference method mismatch`);
  if (generated.metadata?.uncertaintyKm !== recipe.georeference.uncertaintyKm) fail(`Raster output ${recipe.output} uncertainty mismatch`);

  const geometryType = recipe.geometryType ?? 'Polygon';
  const expected = materializeRasterGeometry(recipe, geometryType);
  const actual = generated.features?.[0]?.geometry;
  if (!actual || actual.type !== geometryType) fail(`Raster output ${recipe.output} geometry type mismatch`);
  const expectedPoints = flattenPoints(expected.coordinates);
  const actualPoints = flattenPoints(actual.coordinates);
  if (expectedPoints.length !== actualPoints.length) fail(`Raster output ${recipe.output} point count mismatch`);
  expectedPoints.forEach((point, index) => {
    if (!samePoint(point, actualPoints[index])) fail(`Raster output ${recipe.output} differs at generated point ${index}`);
  });

  const traced = rasterTraceSourcePoints(recipe, geometryType);
  for (const pixel of traced) {
    const transformed = transformRasterPoint(pixel, recipe.georeference, recipe.sourceRaster).lonLat;
    if (!actualPoints.some(point => samePoint(point, transformed))) fail(`Raster output ${recipe.output} lost traced pixel point ${JSON.stringify(pixel)}`);
  }
}

console.log(`History raster geometry recipe check passed: ${recipes.length} reproducible map-derived geometries.`);
