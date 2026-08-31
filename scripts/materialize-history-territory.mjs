import fs from 'node:fs';
import path from 'node:path';
import polygonClipping from 'polygon-clipping';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const modelFile = path.join(dataRoot, 'territory-model.json');
const outRoot = path.join(dataRoot, 'generated', 'territory');
const legacyArchiveRoot = path.join(root, 'public', 'data', 'territory', 'archive');
const legacyManifestFile = path.join(legacyArchiveRoot, 'manifest.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(modelFile)) throw new Error('Missing public/data/history-core/territory-model.json');
const model = readJson(modelFile);
fs.rmSync(outRoot, {recursive: true, force: true});
fs.mkdirSync(outRoot, {recursive: true});

const fragments = new Map((model.fragments ?? []).map(x => [x.id, x]));
const baseStates = model.baseStates ?? [];
const changes = [];
for (const relative of model.changeFiles ?? []) {
  const file = path.join(dataRoot, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing territory change file: ${relative}`);
  changes.push(...(readJson(file).territoryChanges ?? []));
}

const preciseDateKey = date => {
  if (!date?.normalized) return null;
  if (date.precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(date.normalized)) return date.normalized;
  if (date.precision === 'month' && /^\d{4}-\d{2}$/.test(date.normalized)) return `${date.normalized}-01`;
  return null;
};

const toMultiPolygon = geometry => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  throw new Error(`Unsupported territory geometry: ${geometry.type}`);
};

const loadFragmentGeometry = fragment => {
  const file = path.join(dataRoot, fragment.geometryFile);
  if (!fs.existsSync(file)) throw new Error(`Missing geometry file for ${fragment.id}: ${fragment.geometryFile}`);
  const payload = readJson(file);
  const features = payload.type === 'FeatureCollection' ? payload.features : payload.type === 'Feature' ? [payload] : [];
  let merged = [];
  for (const feature of features) {
    const mp = toMultiPolygon(feature.geometry);
    if (!mp.length) continue;
    merged = merged.length ? polygonClipping.union(merged, mp) : mp;
  }
  return merged;
};

const geometryCache = new Map();
const geometryFor = id => {
  if (geometryCache.has(id)) return geometryCache.get(id);
  const fragment = fragments.get(id);
  if (!fragment) throw new Error(`Unknown territory fragment: ${id}`);
  if (fragment.reviewStatus !== 'geometry-verified') throw new Error(`Fragment ${id} is not geometry-verified`);
  const geometry = loadFragmentGeometry(fragment);
  geometryCache.set(id, geometry);
  return geometry;
};

const inferAction = change => {
  if (change.geometryAction) return change.geometryAction;
  if (['acquire', 'unite', 'occupy'].includes(change.operation)) return 'add';
  if (['cede', 'separate', 'withdraw'].includes(change.operation)) return 'remove';
  if (change.operation === 'replace-state') return 'replace';
  return 'metadata-only';
};

const confidenceRank = {low: 0, medium: 1, high: 2};
const minConfidence = ids => {
  let value = 'high';
  for (const id of ids) {
    const fragment = fragments.get(id);
    if (fragment && confidenceRank[fragment.confidence] < confidenceRank[value]) value = fragment.confidence;
  }
  return value;
};

const states = new Map();
const snapshots = [];
const warnings = [];
const snapshotIds = new Set();
const keyOf = item => `${item.polityId}::${item.track}`;

const emitSnapshot = (state, rawId, generatedFrom) => {
  const safeId = rawId.replace(/[^a-zA-Z0-9._-]+/g, '-');
  if (snapshotIds.has(safeId)) throw new Error(`Duplicate generated territory snapshot id: ${safeId}`);
  snapshotIds.add(safeId);

  const geometryFile = `${safeId}.geojson`;
  const uncertaintyFile = `${safeId}.uncertainty.geojson`;
  const uncertainIds = [...state.activeFragmentIds].filter(id => {
    const fragment = fragments.get(id);
    return fragment && fragment.role !== 'territory-area';
  });

  fs.writeFileSync(path.join(outRoot, geometryFile), JSON.stringify({
    type: 'FeatureCollection',
    features: state.geometry.length ? [{
      type: 'Feature',
      properties: {
        polityId: state.polityId,
        track: state.track,
        generated: true,
        generatedFrom,
      },
      geometry: {type: 'MultiPolygon', coordinates: state.geometry},
    }] : [],
  }));

  const uncertaintyFeatures = [];
  for (const id of uncertainIds) {
    const fragment = fragments.get(id);
    const file = path.join(dataRoot, fragment.geometryFile);
    if (!fs.existsSync(file)) continue;
    const payload = readJson(file);
    const sourceFeatures = payload.type === 'FeatureCollection' ? payload.features : payload.type === 'Feature' ? [payload] : [];
    for (const feature of sourceFeatures) uncertaintyFeatures.push({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        historyFragmentId: id,
        role: fragment.role,
        confidence: fragment.confidence,
        uncertaintyMeters: fragment.uncertaintyMeters ?? null,
      },
    });
  }
  fs.writeFileSync(path.join(outRoot, uncertaintyFile), JSON.stringify({type: 'FeatureCollection', features: uncertaintyFeatures}));

  const snapshot = {
    id: safeId,
    polityId: state.polityId,
    effectiveDate: state.date,
    track: state.track,
    territorialModel: state.territorialModel,
    geometryFile: `generated/territory/${geometryFile}`,
    uncertaintyGeometryFile: `generated/territory/${uncertaintyFile}`,
    evidenceDocumentIds: [...state.evidenceDocumentIds],
    derivedFromChangeIds: [...state.derivedFromChangeIds],
    reviewStatus: 'geometry-verified',
    confidence: minConfidence([...state.activeFragmentIds]),
    generated: true,
    generatedFrom,
  };
  snapshots.push(snapshot);
  return snapshot;
};

// Base states and verified changes are replayed on one timeline. This is essential when a later
// authoritative base state exists for the same polity/track: it must not leak backwards into earlier
// changes, and it must reset the accumulated state only from its own effective date onward.
const replay = [];
for (const base of baseStates) {
  const dateKey = preciseDateKey(base.effectiveDate);
  if (!dateKey) {
    warnings.push(`Base ${base.id} skipped: date is not month/day precise`);
    continue;
  }
  replay.push({kind: 'base', dateKey, item: base});
}
for (const change of changes) {
  if (change.reviewStatus !== 'geometry-verified') continue;
  const dateKey = preciseDateKey(change.effectiveDate);
  if (!dateKey) {
    warnings.push(`Change ${change.id} skipped: date is not month/day precise`);
    continue;
  }
  replay.push({kind: 'change', dateKey, item: change});
}
replay.sort((a, b) => {
  const byDate = a.dateKey.localeCompare(b.dateKey);
  if (byDate) return byDate;
  if (a.kind !== b.kind) return a.kind === 'base' ? -1 : 1;
  return String(a.item.id).localeCompare(String(b.item.id));
});

for (const entry of replay) {
  if (entry.kind === 'base') {
    const base = entry.item;
    const areaIds = (base.geometryFragmentIds ?? []).filter(id => fragments.get(id)?.role === 'territory-area');
    let geometry = [];
    for (const id of areaIds) geometry = geometry.length ? polygonClipping.union(geometry, geometryFor(id)) : geometryFor(id);
    if (!geometry.length) {
      warnings.push(`Base ${base.id} skipped: no verified territory-area geometry`);
      continue;
    }

    const state = {
      polityId: base.polityId,
      track: base.track,
      territorialModel: base.territorialModel,
      geometry,
      activeFragmentIds: new Set(base.geometryFragmentIds ?? []),
      evidenceDocumentIds: new Set(base.evidenceDocumentIds ?? []),
      derivedFromChangeIds: [],
      date: base.effectiveDate,
      dateKey: entry.dateKey,
    };
    states.set(keyOf(base), state);
    emitSnapshot(state, `${base.id}-${entry.dateKey}`, 'base-state');
    continue;
  }

  const change = entry.item;
  const stateKey = keyOf(change);
  const state = states.get(stateKey);
  if (!state) {
    warnings.push(`Change ${change.id} skipped: no verified base state active by ${entry.dateKey} for ${stateKey}`);
    continue;
  }

  const action = inferAction(change);
  const ids = change.geometryFragmentIds ?? [];
  const areaIds = ids.filter(id => fragments.get(id)?.role === 'territory-area');
  let delta = [];
  for (const id of areaIds) delta = delta.length ? polygonClipping.union(delta, geometryFor(id)) : geometryFor(id);

  if (action === 'replace') state.geometry = delta;
  if (action === 'add' && delta.length) state.geometry = state.geometry.length ? polygonClipping.union(state.geometry, delta) : delta;
  if (action === 'remove' && delta.length && state.geometry.length) state.geometry = polygonClipping.difference(state.geometry, delta);

  for (const id of ids) state.activeFragmentIds.add(id);
  for (const id of change.evidenceDocumentIds ?? []) state.evidenceDocumentIds.add(id);
  state.derivedFromChangeIds.push(change.id);
  state.territorialModel = change.territorialModel;
  state.date = change.effectiveDate;
  state.dateKey = entry.dateKey;

  emitSnapshot(state, `${change.polityId}-${change.track}-${entry.dateKey}`, 'territory-change');
}

const index = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  generator: 'scripts/materialize-history-territory.mjs',
  snapshots,
  warnings,
};
fs.writeFileSync(path.join(outRoot, 'index.json'), JSON.stringify(index, null, 2));

// Compatibility bridge for the current year-based globe. The canonical generated index above keeps
// exact month/day transitions; the legacy renderer receives the latest verified state within each year.
if (fs.existsSync(legacyManifestFile)) {
  const manifest = readJson(legacyManifestFile);
  const byPolity = new Map();
  for (const snapshot of snapshots) {
    if (snapshot.track !== 'russian-legal-border') continue;
    const year = Number(snapshot.effectiveDate?.normalized?.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const list = byPolity.get(snapshot.polityId) ?? [];
    list.push({...snapshot, year});
    byPolity.set(snapshot.polityId, list);
  }

  for (const [polityId, list] of byPolity) {
    list.sort((a, b) => a.effectiveDate.normalized.localeCompare(b.effectiveDate.normalized));
    const latestPerYear = new Map();
    for (const item of list) latestPerYear.set(item.year, item);
    const timeline = [...latestPerYear.values()].sort((a, b) => a.year - b.year);
    const features = timeline.map((item, index) => {
      const payload = readJson(path.join(dataRoot, item.geometryFile));
      const geometry = payload.features?.[0]?.geometry;
      if (!geometry) return null;
      const next = timeline[index + 1];
      return {
        type: 'Feature',
        properties: {
          name: polityId,
          polity_id: polityId,
          start_date: `${item.year}-01-01`,
          end_date: next ? `${next.year - 1}-12-31` : null,
          history_core_generated: true,
          history_core_effective_date: item.effectiveDate.normalized,
          history_core_confidence: item.confidence,
          history_core_snapshot_id: item.id,
        },
        geometry,
      };
    }).filter(Boolean);
    if (!features.length) continue;

    const bridgeFile = `history-core-${polityId}.geojson`;
    fs.writeFileSync(path.join(legacyArchiveRoot, bridgeFile), JSON.stringify({type: 'FeatureCollection', features}));
    const entry = (manifest.polities ?? []).find(x => x.polity_id === polityId);
    if (entry) {
      entry.file = bridgeFile;
      entry.features = features.length;
      entry.status = 'verified-history-core-generated';
      entry.history_core_generated = true;
    }
  }
  fs.writeFileSync(legacyManifestFile, JSON.stringify(manifest, null, 2));
}

console.log(`History territory materialized: ${snapshots.length} snapshots, ${warnings.length} warnings.`);
