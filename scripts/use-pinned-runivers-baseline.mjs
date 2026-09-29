import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFile = path.join(root, 'public', 'data', 'history-core', 'references', 'runivers-pinned-baseline.json');
const outputDir = path.join(root, 'tmp', 'runivers-discovery');
const outputFile = path.join(outputDir, 'runivers-current-baseline.json');

if (!fs.existsSync(sourceFile)) throw new Error(`Pinned Runivers baseline missing: ${sourceFile}`);
const pinned = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
if (pinned.schemaVersion !== 1 || !Array.isArray(pinned.layers) || !pinned.layers.length) {
  throw new Error('Pinned Runivers baseline metadata is malformed');
}

const vectorLayers = pinned.layers.map((row) => {
  if (!Array.isArray(row) || row.length !== 3 || !row.every(Number.isInteger)) {
    throw new Error(`Malformed pinned Runivers layer: ${JSON.stringify(row)}`);
  }
  const [id, fromYear, toYear] = row;
  return {
    id,
    cls: 'vector_layer',
    displayName: `from_${fromYear}_to_${toYear} pinned Runivers Polygon`,
    keyname: null,
    parentId: pinned.baselineParentId,
    ancestorIds: [pinned.baselineParentId, pinned.boundaryRootId],
    children: true,
    fromYear,
    toYear,
    historicalPolygon: true,
  };
}).sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);

const intervals = new Set();
for (const layer of vectorLayers) {
  const key = `${layer.fromYear}-${layer.toYear}`;
  if (intervals.has(key)) throw new Error(`Pinned Runivers baseline contains duplicate interval ${key}`);
  intervals.add(key);
}

const minYear = Math.min(...vectorLayers.map((layer) => layer.fromYear));
const maxYear = Math.max(...vectorLayers.map((layer) => layer.toYear));
if (minYear > 1462 || maxYear < 2018) {
  throw new Error(`Pinned Runivers baseline range ${minYear}..${maxYear} is insufficient`);
}

const selected = {
  schemaVersion: 5,
  discoveredAt: pinned.capturedAt,
  host: pinned.host,
  root: {id: pinned.boundaryRootId, displayName: 'Границы'},
  boundaryRoot: {id: pinned.boundaryRootId, displayName: 'Границы'},
  preferredParent: {id: pinned.baselineParentId, displayName: 'ноябрь'},
  currentBaselineParent: {id: pinned.baselineParentId, displayName: 'ноябрь'},
  discoveryMode: 'pinned-metadata-live-geometry',
  vectorLayerCount: vectorLayers.length,
  preferredPolygonLayerCount: vectorLayers.length,
  preferredMinYear: minYear,
  preferredMaxYear: maxYear,
  vectorLayers,
  preferredPolygonLayers: vectorLayers,
  baselineSelection: {
    policy: 'Pinned metadata captured from the verified live Runivers parent; geometry is still fetched live from Runivers during regression.',
    seedResourceId: 5455,
    parentId: pinned.baselineParentId,
    parentName: 'ноябрь',
    minYear,
    maxYear,
    layerCount: vectorLayers.length,
    capturedAt: pinned.capturedAt,
  },
  allDiscoveredVectorLayerCount: vectorLayers.length,
};

fs.mkdirSync(outputDir, {recursive: true});
fs.writeFileSync(outputFile, JSON.stringify(selected, null, 2) + '\n');
console.log(`Pinned Runivers metadata loaded: parent ${pinned.baselineParentId}; ${vectorLayers.length} polygon layers; ${minYear}..${maxYear}.`);
console.log('Runivers geometry remains live-only and is not stored in the repository.');
console.log(`Selected baseline written to ${outputFile}`);
