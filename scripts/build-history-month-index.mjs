import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const dataRoot = path.join(publicRoot, 'data', 'history-core');
const coverageFile = path.join(dataRoot, 'coverage-periods.json');
const documentsFile = path.join(dataRoot, 'documents.json');
const territoryIndexFile = path.join(dataRoot, 'generated', 'territory', 'index.json');
const outputDir = path.join(dataRoot, 'generated');
const provisionalDir = path.join(outputDir, 'provisional');
const outputFile = path.join(outputDir, 'month-index.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(coverageFile)) throw new Error('Missing public/data/history-core/coverage-periods.json');
if (!fs.existsSync(documentsFile)) throw new Error('Missing public/data/history-core/documents.json');
const coverage = readJson(coverageFile);
const documents = readJson(documentsFile).documents ?? [];
const documentIds = new Set(documents.map(item => item.id));
const verified = fs.existsSync(territoryIndexFile) ? readJson(territoryIndexFile) : {snapshots: []};
const periods = coverage.periods ?? [];
const snapshots = (verified.snapshots ?? []).filter(item => item.reviewStatus === 'geometry-verified');

fs.rmSync(provisionalDir, {recursive: true, force: true});
fs.mkdirSync(provisionalDir, {recursive: true});

const assertMonth = (value, label) => {
  if (!/^\d{4}-\d{2}$/.test(value ?? '')) throw new Error(`${label} is not YYYY-MM: ${value}`);
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) throw new Error(`${label} has invalid month: ${value}`);
};

const nextMonth = value => {
  let year = Number(value.slice(0, 4));
  let month = Number(value.slice(5, 7)) + 1;
  if (month === 13) { month = 1; year += 1; }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

const monthEndKey = value => `${value}-31`;
const monthStartKey = value => `${value}-01`;
const normalizedSnapshotKey = snapshot => {
  const value = snapshot.effectiveDate?.normalized;
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return null;
};

const normalizeBoundaryDate = (value, side) => {
  if (value === null || value === undefined || value === '') return side === 'start' ? '0000-01-01' : '9999-12-31';
  const text = String(value);
  let match = text.match(/(-?\d{3,4})-(\d{2})-(\d{2})/);
  if (match) return `${String(Number(match[1])).padStart(4, '0')}-${match[2]}-${match[3]}`;
  match = text.match(/(-?\d{3,4})-(\d{2})/);
  if (match) return `${String(Number(match[1])).padStart(4, '0')}-${match[2]}-${side === 'start' ? '01' : '31'}`;
  match = text.match(/-?\d{3,4}/);
  if (match) return `${String(Number(match[0])).padStart(4, '0')}-${side === 'start' ? '01-01' : '12-31'}`;
  return side === 'start' ? '0000-01-01' : '9999-12-31';
};

assertMonth(coverage.minMonth, 'minMonth');
assertMonth(coverage.maxMonth, 'maxMonth');
if (coverage.minMonth > coverage.maxMonth) throw new Error('History coverage minMonth is after maxMonth');

const fallbackCache = new Map();
const provisionalOutputCache = new Map();
const loadFallback = period => {
  if (fallbackCache.has(period.fallbackGeometryFile)) return fallbackCache.get(period.fallbackGeometryFile);
  const file = path.join(publicRoot, period.fallbackGeometryFile);
  const payload = readJson(file);
  const features = payload.type === 'FeatureCollection' ? (payload.features ?? []) : payload.type === 'Feature' ? [payload] : [];
  if (!features.length) throw new Error(`Coverage ${period.id} fallback geometry has no features`);
  const record = {payload, features};
  fallbackCache.set(period.fallbackGeometryFile, record);
  return record;
};

const selectFallbackFeatures = (period, month) => {
  const {features} = loadFallback(period);
  const start = monthStartKey(month);
  const end = monthEndKey(month);
  const validIndices = [];
  for (let i = 0; i < features.length; i += 1) {
    const properties = features[i]?.properties ?? {};
    const featureStart = normalizeBoundaryDate(properties.start_date, 'start');
    const featureEnd = normalizeBoundaryDate(properties.end_date, 'end');
    if (featureStart <= end && featureEnd >= start) validIndices.push(i);
  }
  if (validIndices.length) return {indices: validIndices, forwardProxy: false};

  let latestStart = null;
  for (let i = 0; i < features.length; i += 1) {
    const featureStart = normalizeBoundaryDate(features[i]?.properties?.start_date, 'start');
    if (featureStart <= end && (latestStart === null || featureStart > latestStart)) latestStart = featureStart;
  }
  if (latestStart !== null) {
    const indices = [];
    for (let i = 0; i < features.length; i += 1) {
      if (normalizeBoundaryDate(features[i]?.properties?.start_date, 'start') === latestStart) indices.push(i);
    }
    if (indices.length) return {indices, forwardProxy: false};
  }

  if (period.allowForwardProxy === true) {
    let earliestStart = null;
    for (let i = 0; i < features.length; i += 1) {
      const featureStart = normalizeBoundaryDate(features[i]?.properties?.start_date, 'start');
      if (earliestStart === null || featureStart < earliestStart) earliestStart = featureStart;
    }
    if (earliestStart !== null) {
      const indices = [];
      for (let i = 0; i < features.length; i += 1) {
        if (normalizeBoundaryDate(features[i]?.properties?.start_date, 'start') === earliestStart) indices.push(i);
      }
      if (indices.length) return {indices, forwardProxy: true};
    }
  }

  throw new Error(`Coverage ${period.id} cannot resolve provisional geometry for ${month}`);
};

const materializeProvisional = (period, month) => {
  const source = loadFallback(period);
  const selection = selectFallbackFeatures(period, month);
  const {indices, forwardProxy} = selection;
  const selectionKey = `${period.id}|${period.fallbackGeometryFile}|${indices.join(',')}|forward:${forwardProxy}`;
  const cached = provisionalOutputCache.get(selectionKey);
  if (cached) return cached;

  const hash = createHash('sha1').update(selectionKey).digest('hex').slice(0, 12);
  const fileName = `${period.polityId}-${hash}.geojson`;
  const relativeFile = `data/history-core/generated/provisional/${fileName}`;
  const selected = indices.map(index => source.features[index]);
  const output = {
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Rulers of Russia provisional History Core geometry',
      coveragePeriodId: period.id,
      polityId: period.polityId,
      status: 'reconstruction-provisional',
      confidence: period.confidence,
      bootstrapGeometry: true,
      forwardProxy,
      sourceFile: period.fallbackGeometryFile,
      selectedFeatureIndices: indices,
      warning: forwardProxy
        ? 'This is an explicitly opted-in forward proxy from later bootstrap geometry. It is not evidence of the historical border at this date and can never be treated as geometry-verified.'
        : 'This geometry is an explicitly provisional rendering fallback, not a primary-source-verified boundary.'
    },
    features: selected.map(feature => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        history_core_status: 'reconstruction-provisional',
        history_core_confidence: period.confidence,
        history_core_forward_proxy: forwardProxy,
        history_core_coverage_period_id: period.id,
      },
    })),
  };
  fs.writeFileSync(path.join(provisionalDir, fileName), JSON.stringify(output));
  const result = {geometryFile: relativeFile, provisionalStateId: `provisional-${period.polityId}-${hash}`, forwardProxy};
  provisionalOutputCache.set(selectionKey, result);
  return result;
};

for (const period of periods) {
  assertMonth(period.startMonth, `Coverage ${period.id} startMonth`);
  assertMonth(period.endMonth, `Coverage ${period.id} endMonth`);
  if (period.startMonth > period.endMonth) throw new Error(`Coverage ${period.id} has reversed dates`);
  if (!period.polityId || !period.track || !period.territorialModel || !period.fallbackGeometryFile) {
    throw new Error(`Coverage ${period.id} is structurally incomplete`);
  }
  if (period.status !== 'reconstruction-provisional' || period.bootstrapGeometry !== true) {
    throw new Error(`Coverage ${period.id} must be explicitly marked reconstruction-provisional/bootstrapGeometry=true`);
  }
  if (!Array.isArray(period.evidenceDocumentIds) || period.evidenceDocumentIds.length === 0) {
    throw new Error(`Coverage ${period.id} has no documentary anchors`);
  }
  for (const id of period.evidenceDocumentIds) {
    if (!documentIds.has(id)) throw new Error(`Coverage ${period.id} references unknown document ${id}`);
  }
  const fallbackFile = path.join(publicRoot, period.fallbackGeometryFile);
  if (!fs.existsSync(fallbackFile)) throw new Error(`Coverage ${period.id} fallback geometry missing: ${period.fallbackGeometryFile}`);
  loadFallback(period);
}

const verifiedByPolityTrack = new Map();
for (const snapshot of snapshots) {
  const dateKey = normalizedSnapshotKey(snapshot);
  if (!dateKey) continue;
  const validFromMonth = snapshot.coverageAnchorMonth ?? dateKey.slice(0, 7);
  const validThroughMonth = snapshot.validThroughMonth ?? null;
  const key = `${snapshot.polityId}::${snapshot.track}`;
  const list = verifiedByPolityTrack.get(key) ?? [];
  list.push({...snapshot, __dateKey: dateKey, __validFromMonth: validFromMonth, __validThroughMonth: validThroughMonth});
  verifiedByPolityTrack.set(key, list);
}
for (const list of verifiedByPolityTrack.values()) list.sort((a, b) => a.__validFromMonth.localeCompare(b.__validFromMonth) || a.__dateKey.localeCompare(b.__dateKey));

const months = [];
const coverageCounts = new Map();
let cursor = coverage.minMonth;
while (cursor <= coverage.maxMonth) {
  const matches = periods.filter(period => cursor >= period.startMonth && cursor <= period.endMonth);
  if (matches.length !== 1) {
    throw new Error(`History month ${cursor} resolves to ${matches.length} coverage periods; expected exactly 1`);
  }
  const period = matches[0];
  const key = `${period.polityId}::${period.track}`;
  const candidates = verifiedByPolityTrack.get(key) ?? [];
  let latestStarted = null;
  for (const candidate of candidates) {
    if (candidate.__validFromMonth <= cursor) latestStarted = candidate;
    else break;
  }
  const chosen = latestStarted && (!latestStarted.__validThroughMonth || cursor <= latestStarted.__validThroughMonth)
    ? latestStarted
    : null;

  if (chosen) {
    months.push({
      month: cursor,
      polityId: period.polityId,
      label: period.label,
      track: period.track,
      territorialModel: chosen.territorialModel,
      geometryFile: `data/history-core/${chosen.geometryFile}`,
      uncertaintyGeometryFile: chosen.uncertaintyGeometryFile ? `data/history-core/${chosen.uncertaintyGeometryFile}` : null,
      status: 'geometry-verified',
      confidence: chosen.confidence,
      evidenceDocumentIds: chosen.evidenceDocumentIds ?? [],
      bootstrapGeometry: false,
      snapshotId: chosen.id,
      effectiveDate: chosen.effectiveDate?.normalized ?? null,
      historicalDate: chosen.historicalDate ?? null,
      validThroughMonth: chosen.validThroughMonth ?? null,
      derivedFromChangeIds: chosen.derivedFromChangeIds ?? [],
    });
    coverageCounts.set('geometry-verified', (coverageCounts.get('geometry-verified') ?? 0) + 1);
  } else {
    const provisional = materializeProvisional(period, cursor);
    months.push({
      month: cursor,
      polityId: period.polityId,
      label: period.label,
      track: period.track,
      territorialModel: period.territorialModel,
      geometryFile: provisional.geometryFile,
      uncertaintyGeometryFile: null,
      status: period.status,
      confidence: period.confidence,
      evidenceDocumentIds: period.evidenceDocumentIds ?? [],
      bootstrapGeometry: true,
      forwardProxy: provisional.forwardProxy,
      snapshotId: null,
      provisionalStateId: provisional.provisionalStateId,
      effectiveDate: period.startMonth,
      coveragePeriodId: period.id,
      notes: period.notes ?? null,
    });
    coverageCounts.set(period.status, (coverageCounts.get(period.status) ?? 0) + 1);
  }

  cursor = nextMonth(cursor);
}

const firstYear = Number(coverage.minMonth.slice(0, 4));
const lastYear = Number(coverage.maxMonth.slice(0, 4));
const firstMonth = Number(coverage.minMonth.slice(5, 7));
const lastMonth = Number(coverage.maxMonth.slice(5, 7));
const expectedCount = (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1;
if (months.length !== expectedCount) throw new Error(`Month index count ${months.length} != expected ${expectedCount}`);
if (coverage.minMonth === '0862-01' && coverage.maxMonth === '2026-12' && months.length !== 13980) {
  throw new Error(`Full Russian-history coverage must contain 13980 months, got ${months.length}`);
}
for (const item of months) {
  if (!fs.existsSync(path.join(publicRoot, item.geometryFile))) throw new Error(`Month ${item.month} points to missing geometry ${item.geometryFile}`);
}

fs.mkdirSync(outputDir, {recursive: true});
const output = {
  schema_version: 3,
  dataset: 'Rulers of Russia month-resolved historical territory index',
  generated_at: new Date().toISOString(),
  minMonth: coverage.minMonth,
  maxMonth: coverage.maxMonth,
  monthCount: months.length,
  complete: true,
  provisionalStateCount: provisionalOutputCache.size,
  forwardProxyMonthCount: months.filter(item => item.forwardProxy === true).length,
  resolutionRule: 'Use the latest-started geometry-verified History Core state only while that snapshot remains within its explicit validity interval; never resurrect an older verified state after a later bounded snapshot expires. Otherwise materialize an explicitly provisional dated bootstrap state. A later-dated proxy is permitted only when the coverage period explicitly opts in and remains visibly non-canonical.',
  statusCounts: Object.fromEntries([...coverageCounts.entries()].sort()),
  months,
};
fs.writeFileSync(outputFile, JSON.stringify(output));
console.log(`History month index generated: ${months.length} months (${coverage.minMonth}..${coverage.maxMonth}), ${provisionalOutputCache.size} provisional geometry states, ${output.forwardProxyMonthCount} explicit forward-proxy months, no gaps.`);
