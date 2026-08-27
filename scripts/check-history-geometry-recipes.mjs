import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => path.join(dir, name))
  : [];
const flatten = (files, key) => files.flatMap(file => readJson(file)[key] ?? []);
const fail = message => { throw new Error(message); };
const samePoint = (a, b, eps = 1e-8) => Array.isArray(a) && Array.isArray(b) && Math.abs(a[0] - b[0]) <= eps && Math.abs(a[1] - b[1]) <= eps;
const isWgs84Display = recipe => /\bWGS\s*-?\s*84\b/i.test(String(recipe.sourceCrs ?? ''));

const model = readJson(path.join(dataRoot, 'territory-model.json'));
const fragments = new Map((model.fragments ?? []).map(fragment => [fragment.id, fragment]));
const recipes = flatten(listJson(path.join(dataRoot, 'geometry-recipes')), 'recipes');
const recipeByFragment = new Map();
const recipeByOutput = new Map();

const rootDocuments = readJson(path.join(dataRoot, 'documents.json')).documents ?? [];
const modularDocuments = flatten(listJson(path.join(dataRoot, 'documents')), 'documents');
const documentIds = new Set([...rootDocuments, ...modularDocuments].map(document => document.id));

for (const recipe of recipes) {
  if (!recipe.id || !recipe.fragmentId || !recipe.output) fail(`Incomplete geometry recipe ${recipe.id ?? '<missing>'}`);
  if (recipeByFragment.has(recipe.fragmentId)) fail(`Multiple geometry recipes target fragment ${recipe.fragmentId}`);
  if (recipeByOutput.has(recipe.output)) fail(`Multiple geometry recipes write ${recipe.output}`);
  recipeByFragment.set(recipe.fragmentId, recipe);
  recipeByOutput.set(recipe.output, recipe);

  const fragment = fragments.get(recipe.fragmentId);
  if (!fragment) fail(`Geometry recipe ${recipe.id} targets unknown fragment ${recipe.fragmentId}`);
  if (fragment.reviewStatus !== 'geometry-verified') fail(`Geometry recipe ${recipe.id} targets non-verified fragment ${recipe.fragmentId}`);
  if (fragment.geometryFile !== recipe.output) fail(`Geometry recipe ${recipe.id} output ${recipe.output} differs from fragment file ${fragment.geometryFile}`);
  if (fragment.track !== recipe.track) fail(`Geometry recipe ${recipe.id} track ${recipe.track} differs from fragment track ${fragment.track}`);
  if (!Array.isArray(recipe.points) || recipe.points.length < 2) fail(`Geometry recipe ${recipe.id} has fewer than two source points`);
  if (!Array.isArray(recipe.evidenceDocumentIds) || recipe.evidenceDocumentIds.length === 0) fail(`Geometry recipe ${recipe.id} has no evidence documents`);
  for (const id of recipe.evidenceDocumentIds) if (!documentIds.has(id)) fail(`Geometry recipe ${recipe.id} references unknown document ${id}`);

  if (!isWgs84Display(recipe) && fragment.confidence === 'high') {
    fail(`Geometry fragment ${fragment.id} is high-confidence on the WGS84 globe but recipe ${recipe.id} uses untransformed source CRS: ${recipe.sourceCrs ?? 'unspecified'}`);
  }

  const outputFile = path.join(dataRoot, recipe.output);
  if (!fs.existsSync(outputFile)) fail(`Geometry recipe ${recipe.id} output is missing: ${recipe.output}`);
  const generated = readJson(outputFile);
  if (generated.metadata?.recipeId !== recipe.id || generated.metadata?.generatedFromSourceCoordinates !== true) {
    fail(`Geometry output ${recipe.output} is not marked as generated from recipe ${recipe.id}`);
  }
  const expectedDatumStatus = isWgs84Display(recipe)
    ? 'wgs84-or-official-wgs84-recalculation'
    : 'source-geographic-untransformed';
  if (generated.metadata?.displayDatumStatus !== expectedDatumStatus) {
    fail(`Geometry output ${recipe.output} datum status mismatch: expected ${expectedDatumStatus}`);
  }
  const coordinates = generated.features?.[0]?.geometry?.coordinates ?? [];
  for (const point of recipe.points) {
    if (!coordinates.some(candidate => samePoint(candidate, point))) fail(`Generated ${recipe.output} lost source treaty point ${JSON.stringify(point)}`);
  }
}

for (const relative of model.changeFiles ?? []) {
  const file = path.join(dataRoot, relative);
  for (const change of readJson(file).territoryChanges ?? []) {
    if (change.reviewStatus !== 'geometry-verified') continue;
    if (change.geometry?.method !== 'derived-from-boundary-text') continue;
    for (const fragmentId of change.geometryFragmentIds ?? []) {
      if (!recipeByFragment.has(fragmentId)) {
        fail(`Coordinate-derived verified change ${change.id} uses fragment ${fragmentId} without a geometry recipe`);
      }
    }
  }
}

console.log(`History geometry recipe check passed: ${recipes.length} source-coordinate recipes with datum-aware confidence.`);
