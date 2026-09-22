import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const startMonth = process.env.RUNIVERS_START_MONTH;
const endMonth = process.env.RUNIVERS_END_MONTH;
const sourceDiscoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-current-baseline.json');
const monthIndexFile = path.join(root, 'public', 'data', 'history-core', 'generated', 'month-index.json');
const validatorFile = path.join(root, 'scripts', 'validate-runivers-regression.mjs');

if (!/^\d{4}-\d{2}$/.test(startMonth || '') || !/^\d{4}-\d{2}$/.test(endMonth || '') || startMonth > endMonth) {
  throw new Error(`Invalid Runivers shard range: ${startMonth || '<missing>'}..${endMonth || '<missing>'}`);
}
if (!fs.existsSync(sourceDiscoveryFile)) throw new Error(`Runivers discovery report missing: ${sourceDiscoveryFile}`);
if (!fs.existsSync(monthIndexFile)) throw new Error(`History month index missing: ${monthIndexFile}`);
if (!fs.existsSync(validatorFile)) throw new Error(`Runivers validator missing: ${validatorFile}`);

const startYear = Number(startMonth.slice(0, 4));
const endYear = Number(endMonth.slice(0, 4));
const slug = `${startMonth.replace('-', '')}-${endMonth.replace('-', '')}`;
const shardDir = path.join(root, 'tmp', 'runivers-shards', slug);
fs.mkdirSync(shardDir, {recursive: true});

const discovery = JSON.parse(fs.readFileSync(sourceDiscoveryFile, 'utf8'));
const originalLayers = discovery.vectorLayers ?? [];
discovery.vectorLayers = originalLayers.filter((layer) => Number.isInteger(layer.fromYear)
  && Number.isInteger(layer.toYear)
  && layer.toYear >= startYear
  && layer.fromYear <= endYear);
if (!discovery.vectorLayers.length) throw new Error(`No Runivers layers overlap ${startMonth}..${endMonth}`);
const shardDiscoveryFile = path.join(shardDir, 'runivers-baseline.json');
fs.writeFileSync(shardDiscoveryFile, JSON.stringify(discovery, null, 2));

const monthIndex = JSON.parse(fs.readFileSync(monthIndexFile, 'utf8'));
const originalMonthCount = monthIndex.months?.length ?? 0;
const rangeMonths = (monthIndex.months ?? []).filter((row) => row.month >= startMonth && row.month <= endMonth);
if (!rangeMonths.length) throw new Error(`No History Core months overlap ${startMonth}..${endMonth}`);

// Runivers reference intervals are year-granular. Do not pretend they identify
// which side of a within-year History Core transition is the corresponding
// contour. Keep only calendar years where one verified History Core full-state
// geometry is valid for all 12 months. Exact transition months remain protected
// by History Core provenance/geometry CI, while this external regression compares
// only dates that the Runivers year labels can identify unambiguously.
const monthsByYear = new Map();
for (const row of rangeMonths) {
  const year = row.month.slice(0, 4);
  const list = monthsByYear.get(year) ?? [];
  list.push(row);
  monthsByYear.set(year, list);
}

const comparableYears = new Set();
const excludedYears = [];
for (const [year, rows] of [...monthsByYear.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const verifiedRows = rows.filter((row) => row.status === 'geometry-verified' && row.geometryFile);
  const geometries = new Set(verifiedRows.map((row) => row.geometryFile));
  const months = new Set(verifiedRows.map((row) => row.month.slice(5, 7)));
  if (rows.length === 12 && verifiedRows.length === 12 && geometries.size === 1 && months.size === 12) {
    comparableYears.add(year);
  } else {
    excludedYears.push({
      year: Number(year),
      monthCount: rows.length,
      verifiedMonthCount: verifiedRows.length,
      geometryCount: geometries.size,
      reason: 'Runivers is year-granular; History Core changes within this calendar year or lacks one full-year verified state',
    });
  }
}

const comparableMonths = rangeMonths.filter((row) => comparableYears.has(row.month.slice(0, 4)));
if (!comparableMonths.length) {
  throw new Error(`No full-calendar-year History Core states can be compared to year-granular Runivers in ${startMonth}..${endMonth}`);
}
monthIndex.months = comparableMonths;
fs.writeFileSync(monthIndexFile, JSON.stringify(monthIndex, null, 2));

const excludedMonthCount = rangeMonths.length - comparableMonths.length;
console.log(`Runivers shard ${startMonth}..${endMonth}: ${discovery.vectorLayers.length}/${originalLayers.length} layers; ${comparableMonths.length}/${rangeMonths.length} shard months are unambiguous full-year comparisons (${excludedMonthCount} boundary/transition months excluded from the year-granular cross-check).`);

const child = spawnSync(process.execPath, ['--import', path.join(root, 'scripts', 'runivers-fetch-cache.mjs'), validatorFile], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    RUNIVERS_DISCOVERY_FILE: shardDiscoveryFile,
  },
});
if (child.error) throw child.error;

const reportFile = path.join(root, 'tmp', 'runivers-regression', 'report.json');
if (fs.existsSync(reportFile)) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  report.shard = {
    startMonth,
    endMonth,
    referenceGranularity: 'year',
    comparisonPolicy: 'Only full calendar years with one verified History Core geometry are compared to Runivers year intervals.',
    rangeMonthCount: rangeMonths.length,
    comparedMonthCount: comparableMonths.length,
    excludedMonthCount,
    excludedYears,
  };
  if (report.summary) {
    report.summary.auditedRange = {startMonth, endMonth};
    report.summary.historyMonthsInShard = rangeMonths.length;
    report.summary.historyMonthsComparedAtRuniversYearGranularity = comparableMonths.length;
    report.summary.historyMonthsExcludedFromRuniversYearCrossCheck = excludedMonthCount;
    report.summary.runiversReferenceGranularity = 'year';
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
}

process.exitCode = child.status ?? 1;
