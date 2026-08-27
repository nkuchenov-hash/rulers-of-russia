import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const dataRoot = path.join(publicRoot, 'data', 'history-core');
const coverageFile = path.join(dataRoot, 'coverage-periods.json');
const territoryIndexFile = path.join(dataRoot, 'generated', 'territory', 'index.json');
const outputDir = path.join(dataRoot, 'generated');
const outputFile = path.join(outputDir, 'month-index.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(coverageFile)) throw new Error('Missing public/data/history-core/coverage-periods.json');
const coverage = readJson(coverageFile);
const verified = fs.existsSync(territoryIndexFile) ? readJson(territoryIndexFile) : {snapshots: []};
const periods = coverage.periods ?? [];
const snapshots = (verified.snapshots ?? []).filter(item => item.reviewStatus === 'geometry-verified');

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
const normalizedSnapshotKey = snapshot => {
  const value = snapshot.effectiveDate?.normalized;
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return null;
};

assertMonth(coverage.minMonth, 'minMonth');
assertMonth(coverage.maxMonth, 'maxMonth');
if (coverage.minMonth > coverage.maxMonth) throw new Error('History coverage minMonth is after maxMonth');

for (const period of periods) {
  assertMonth(period.startMonth, `Coverage ${period.id} startMonth`);
  assertMonth(period.endMonth, `Coverage ${period.id} endMonth`);
  if (period.startMonth > period.endMonth) throw new Error(`Coverage ${period.id} has reversed dates`);
  if (!period.polityId || !period.track || !period.territorialModel || !period.fallbackGeometryFile) {
    throw new Error(`Coverage ${period.id} is structurally incomplete`);
  }
  const fallbackFile = path.join(publicRoot, period.fallbackGeometryFile);
  if (!fs.existsSync(fallbackFile)) throw new Error(`Coverage ${period.id} fallback geometry missing: ${period.fallbackGeometryFile}`);
}

const verifiedByPolityTrack = new Map();
for (const snapshot of snapshots) {
  const dateKey = normalizedSnapshotKey(snapshot);
  if (!dateKey) continue;
  const key = `${snapshot.polityId}::${snapshot.track}`;
  const list = verifiedByPolityTrack.get(key) ?? [];
  list.push({...snapshot, __dateKey: dateKey});
  verifiedByPolityTrack.set(key, list);
}
for (const list of verifiedByPolityTrack.values()) list.sort((a, b) => a.__dateKey.localeCompare(b.__dateKey));

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
  const end = monthEndKey(cursor);
  let chosen = null;
  for (const candidate of candidates) {
    if (candidate.__dateKey <= end) chosen = candidate;
    else break;
  }

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
      derivedFromChangeIds: chosen.derivedFromChangeIds ?? [],
    });
    coverageCounts.set('geometry-verified', (coverageCounts.get('geometry-verified') ?? 0) + 1);
  } else {
    months.push({
      month: cursor,
      polityId: period.polityId,
      label: period.label,
      track: period.track,
      territorialModel: period.territorialModel,
      geometryFile: period.fallbackGeometryFile,
      uncertaintyGeometryFile: null,
      status: period.status,
      confidence: period.confidence,
      evidenceDocumentIds: period.evidenceDocumentIds ?? [],
      bootstrapGeometry: true,
      snapshotId: null,
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

fs.mkdirSync(outputDir, {recursive: true});
const output = {
  schema_version: 1,
  dataset: 'Rulers of Russia month-resolved historical territory index',
  generated_at: new Date().toISOString(),
  minMonth: coverage.minMonth,
  maxMonth: coverage.maxMonth,
  monthCount: months.length,
  complete: true,
  resolutionRule: 'Use latest geometry-verified History Core state at month end; otherwise use explicitly provisional coverage geometry.',
  statusCounts: Object.fromEntries([...coverageCounts.entries()].sort()),
  months,
};
fs.writeFileSync(outputFile, JSON.stringify(output));
console.log(`History month index generated: ${months.length} months (${coverage.minMonth}..${coverage.maxMonth}), no gaps.`);
