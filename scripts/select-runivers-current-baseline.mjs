import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFile = path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const outputFile = path.join(root, 'tmp', 'runivers-discovery', 'runivers-current-baseline.json');

if (!fs.existsSync(sourceFile)) throw new Error(`Runivers discovery report missing: ${sourceFile}`);
const discovery = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
const layers = discovery.preferredPolygonLayers ?? [];
if (!Array.isArray(layers) || !layers.length) throw new Error('Runivers discovery has no preferredPolygonLayers');

const sorted = [...layers].sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
const minYear = Math.min(...sorted.map((item) => item.fromYear));
const maxYear = Math.max(...sorted.map((item) => item.toYear));
const intervalKeys = new Set();
for (const layer of sorted) {
  if (!Number.isInteger(layer.id) || !Number.isInteger(layer.fromYear) || !Number.isInteger(layer.toYear)) {
    throw new Error(`Malformed Runivers baseline layer: ${JSON.stringify(layer)}`);
  }
  const key = `${layer.fromYear}-${layer.toYear}`;
  if (intervalKeys.has(key)) {
    throw new Error(`Current Runivers baseline contains duplicate interval ${key}; refusing to guess between layers`);
  }
  intervalKeys.add(key);
}

const selected = {
  ...discovery,
  schemaVersion: Math.max(5, Number(discovery.schemaVersion ?? 0)),
  baselineSelection: {
    policy: 'Direct children of the parent of a known live current Runivers boundary layer, restricted to from_X_to_Y historical Polygon layers.',
    seedResourceId: discovery.seedResource?.id ?? null,
    parentId: discovery.preferredParent?.id ?? null,
    parentName: discovery.preferredParent?.displayName ?? null,
    minYear,
    maxYear,
    layerCount: sorted.length,
  },
  allDiscoveredVectorLayerCount: discovery.vectorLayerCount ?? null,
  vectorLayerCount: sorted.length,
  vectorLayers: sorted,
};
fs.writeFileSync(outputFile, JSON.stringify(selected, null, 2) + '\n');
console.log(`Runivers current baseline pinned: parent ${selected.baselineSelection.parentId}:${selected.baselineSelection.parentName}; ${sorted.length} polygon layers; ${minYear}..${maxYear}.`);
console.log(`Selected discovery written to ${outputFile}`);
