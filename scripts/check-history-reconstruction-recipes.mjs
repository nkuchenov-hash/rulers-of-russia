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

const model = readJson(path.join(dataRoot, 'territory-model.json'));
const fragmentById = new Map((model.fragments ?? []).map(fragment => [fragment.id, fragment]));
const rootDocuments = readJson(path.join(dataRoot, 'documents.json')).documents ?? [];
const modularDocuments = flatten(listJson(path.join(dataRoot, 'documents')), 'documents');
const documentById = new Map([...rootDocuments, ...modularDocuments].map(document => [document.id, document]));
const recipes = flatten(listJson(path.join(dataRoot, 'reconstruction-recipes')), 'recipes');
const recipeByFragment = new Map();

for (const recipe of recipes) {
  if (!recipe.id || !recipe.fragmentId || !recipe.output) fail(`Incomplete reconstruction recipe ${recipe.id ?? '<missing>'}`);
  if (recipeByFragment.has(recipe.fragmentId)) fail(`Multiple reconstruction recipes target ${recipe.fragmentId}`);
  recipeByFragment.set(recipe.fragmentId, recipe);
  const fragment = fragmentById.get(recipe.fragmentId);
  if (!fragment) fail(`Reconstruction ${recipe.id} targets unknown fragment ${recipe.fragmentId}`);
  if (fragment.reviewStatus !== 'source-verified') fail(`Reconstruction ${recipe.id} must target source-verified fragment, got ${fragment.reviewStatus}`);
  if (fragment.geometryFile !== recipe.output) fail(`Reconstruction ${recipe.id} output differs from fragment geometryFile`);
  if (fragment.track !== recipe.track) fail(`Reconstruction ${recipe.id} track differs from fragment`);

  for (const id of recipe.evidenceDocumentIds ?? []) {
    const doc = documentById.get(id);
    if (!doc) fail(`Reconstruction ${recipe.id} references unknown primary evidence ${id}`);
    if (!['A1-archival-original','A2-official-document-publication','A3-contemporary-official-map'].includes(doc.tier)) {
      fail(`Reconstruction ${recipe.id} primary evidence ${id} is not A1/A2/A3`);
    }
  }
  for (const id of recipe.interpretationDocumentIds ?? []) {
    const doc = documentById.get(id);
    if (!doc) fail(`Reconstruction ${recipe.id} references unknown interpretation ${id}`);
    if (doc.tier !== 'B1-russian-academic-interpretation') fail(`Reconstruction ${recipe.id} interpretation ${id} must be B1`);
  }

  const outputFile = path.join(dataRoot, recipe.output);
  if (!fs.existsSync(outputFile)) fail(`Reconstruction output missing: ${recipe.output}`);
  const output = readJson(outputFile);
  if (output.metadata?.recipeId !== recipe.id || output.metadata?.generatedFromEditableAnchors !== true) {
    fail(`Reconstruction output ${recipe.output} is not generated from ${recipe.id}`);
  }
  if (output.metadata?.canonicalExactGeometry !== false || output.metadata?.status !== 'source-verified') {
    fail(`Reconstruction ${recipe.id} may not claim exact/geometry-verified status`);
  }
  const anchorFeatures = (output.features ?? []).filter(feature => feature.properties?.featureRole === 'documentary-anchor');
  if (anchorFeatures.length !== recipe.anchors.length) fail(`Reconstruction ${recipe.id} lost anchors during materialization`);
}

for (const relative of model.changeFiles ?? []) {
  const file = path.join(dataRoot, relative);
  for (const change of readJson(file).territoryChanges ?? []) {
    if (change.reviewStatus !== 'source-verified') continue;
    for (const fragmentId of change.geometryFragmentIds ?? []) {
      const fragment = fragmentById.get(fragmentId);
      if (fragment?.reviewStatus === 'source-verified' && !recipeByFragment.has(fragmentId)) {
        fail(`Source-verified reconstruction change ${change.id} uses ${fragmentId} without an editable reconstruction recipe`);
      }
    }
  }
}

console.log(`History reconstruction recipe check passed: ${recipes.length} editable reconstructions.`);
