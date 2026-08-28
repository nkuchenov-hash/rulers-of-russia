import fs from 'node:fs';
import path from 'node:path';
import { geoInterpolate } from 'd3-geo';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const recipeRoot = path.join(dataRoot, 'reconstruction-recipes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const files = fs.existsSync(recipeRoot)
  ? fs.readdirSync(recipeRoot).filter(name => name.endsWith('.json')).sort().map(name => path.join(recipeRoot, name))
  : [];
const recipes = files.flatMap(file => readJson(file).recipes ?? []);

const confidenceRank = {low: 1, medium: 2, high: 3};
const uncertaintyRank = {narrow: 1, medium: 2, broad: 3};
const assert = (ok, message) => { if (!ok) throw new Error(message); };

function densify(a, b, steps = 16) {
  const interpolation = geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
  const points = [];
  for (let i = 0; i <= steps; i += 1) points.push(interpolation(i / steps));
  return points;
}

for (const recipe of recipes) {
  assert(recipe.id && recipe.fragmentId && recipe.output, `Incomplete reconstruction recipe ${recipe.id ?? '<missing>'}`);
  assert(Array.isArray(recipe.evidenceDocumentIds) && recipe.evidenceDocumentIds.length, `Reconstruction ${recipe.id} has no primary evidence`);
  assert(Array.isArray(recipe.interpretationDocumentIds) && recipe.interpretationDocumentIds.length, `Reconstruction ${recipe.id} has no interpretation evidence`);
  assert(Array.isArray(recipe.anchors) && recipe.anchors.length >= 2, `Reconstruction ${recipe.id} needs anchors`);
  assert(Array.isArray(recipe.segments) && recipe.segments.length, `Reconstruction ${recipe.id} needs segments`);

  const anchorById = new Map();
  for (const anchor of recipe.anchors) {
    assert(anchor.id && !anchorById.has(anchor.id), `Duplicate/missing anchor in ${recipe.id}: ${anchor.id}`);
    assert(Number.isFinite(anchor.lon) && anchor.lon >= -180 && anchor.lon <= 180, `Invalid longitude in ${recipe.id}:${anchor.id}`);
    assert(Number.isFinite(anchor.lat) && anchor.lat >= -90 && anchor.lat <= 90, `Invalid latitude in ${recipe.id}:${anchor.id}`);
    assert(confidenceRank[anchor.localizationConfidence], `Invalid localization confidence in ${recipe.id}:${anchor.id}`);
    assert(uncertaintyRank[anchor.uncertaintyClass], `Invalid uncertainty class in ${recipe.id}:${anchor.id}`);
    anchorById.set(anchor.id, anchor);
  }

  const features = [];
  for (const segment of recipe.segments) {
    const from = anchorById.get(segment.from);
    const to = anchorById.get(segment.to);
    assert(from && to, `Unknown segment anchor in ${recipe.id}: ${segment.from} -> ${segment.to}`);
    assert(confidenceRank[segment.confidence], `Invalid segment confidence in ${recipe.id}`);
    assert(uncertaintyRank[segment.uncertaintyClass], `Invalid segment uncertainty in ${recipe.id}`);
    assert(['soft-corridor', 'frontier-band'].includes(segment.visualMode), `Invalid visualMode in ${recipe.id}`);
    features.push({
      type: 'Feature',
      properties: {
        id: `${recipe.fragmentId}:${segment.from}:${segment.to}`,
        fragmentId: recipe.fragmentId,
        history_core_status: 'source-verified',
        reconstruction: true,
        fromAnchorId: segment.from,
        toAnchorId: segment.to,
        segmentConfidence: segment.confidence,
        uncertaintyClass: segment.uncertaintyClass,
        visualMode: segment.visualMode,
        note: segment.note ?? null,
        evidenceDocumentIds: recipe.evidenceDocumentIds,
        interpretationDocumentIds: recipe.interpretationDocumentIds
      },
      geometry: {type: 'LineString', coordinates: densify(from, to)}
    });
  }

  for (const anchor of recipe.anchors) {
    features.push({
      type: 'Feature',
      properties: {
        id: `${recipe.fragmentId}:anchor:${anchor.id}`,
        fragmentId: recipe.fragmentId,
        history_core_status: 'source-verified',
        reconstruction: true,
        featureRole: 'documentary-anchor',
        anchorId: anchor.id,
        label: anchor.label,
        treatyContext: anchor.treatyContext ?? null,
        localizationConfidence: anchor.localizationConfidence,
        uncertaintyClass: anchor.uncertaintyClass,
        locatorBasis: anchor.locatorBasis,
        evidenceDocumentIds: recipe.evidenceDocumentIds,
        interpretationDocumentIds: recipe.interpretationDocumentIds
      },
      geometry: {type: 'Point', coordinates: [anchor.lon, anchor.lat]}
    });
  }

  const outputFile = path.join(dataRoot, recipe.output);
  fs.mkdirSync(path.dirname(outputFile), {recursive: true});
  fs.writeFileSync(outputFile, JSON.stringify({
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Rulers of Russia History Core generated reconstruction',
      recipeId: recipe.id,
      fragmentId: recipe.fragmentId,
      generatedFromEditableAnchors: true,
      status: 'source-verified',
      canonicalExactGeometry: false,
      polityId: recipe.polityId,
      track: recipe.track,
      territorialModel: recipe.territorialModel,
      effectiveFrom: recipe.effectiveFrom,
      method: recipe.method,
      evidenceDocumentIds: recipe.evidenceDocumentIds,
      interpretationDocumentIds: recipe.interpretationDocumentIds,
      notes: recipe.notes ?? null
    },
    features
  }, null, 2) + '\n');
}

console.log(`History reconstructions materialized: ${recipes.length} editable source-verified recipes.`);
