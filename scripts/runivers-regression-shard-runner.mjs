import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const startMonth = process.env.RUNIVERS_START_MONTH;
const endMonth = process.env.RUNIVERS_END_MONTH;
const sourceDiscoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-current-baseline.json');
const monthIndexFile = path.join(root, 'public', 'data', 'history-core', 'generated', 'month-index.json');
const validatorFile = path.join(root, 'scripts', 'validate-runivers-regression.mjs');
const reportDir = path.join(root, 'tmp', 'runivers-regression');
const reportFile = path.join(reportDir, 'report.json');

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
const rangeMonths = (monthIndex.months ?? []).filter((row) => row.month >= startMonth && row.month <= endMonth);
if (!rangeMonths.length) throw new Error(`No History Core months overlap ${startMonth}..${endMonth}`);

// Runivers reference intervals are year-granular. Do not pretend they identify
// which side of a within-year History Core transition is the corresponding
// contour. Keep only calendar years where one verified History Core full-state
// geometry is valid for all 12 months.
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

async function probe(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, redirect: 'follow'});
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runiversHealthy() {
  const host = String(discovery.host || '').replace(/\/$/, '');
  const probeId = discovery.vectorLayers[0]?.id;
  if (!host || !Number.isInteger(probeId)) return false;
  const urls = [
    `${host}/api/resource/${probeId}/0/0/0.mvt`,
    `${host}/api/resource/${probeId}/feature/?srs=4326&limit=1`,
  ];
  const results = await Promise.all(urls.map((url) => probe(url)));
  return results.some(Boolean);
}

const sourceHealthy = await runiversHealthy();
if (!sourceHealthy) {
  fs.mkdirSync(reportDir, {recursive: true});
  const report = {
    schema_version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      auditedRange: {startMonth, endMonth},
      runiversHost: discovery.host,
      runiversLayersDiscovered: discovery.vectorLayers.length,
      datedLayersAudited: discovery.vectorLayers.length,
      usableReferenceLayers: 0,
      comparisons: 0,
      passingComparisons: 0,
      overrides: 0,
      failedComparisons: 0,
      referenceFailures: discovery.vectorLayers.length,
      missingStates: 0,
      uncoveredMonths: 0,
      externalOutage: true,
    },
    stateCoverage: [],
    failedComparisons: [],
    referenceFailures: [{error: 'Runivers preflight failed on both canonical MVT and WGS84 feature endpoints'}],
    uncoveredMonths: [],
    shard: {
      startMonth,
      endMonth,
      referenceGranularity: 'year',
      comparisonPolicy: 'Only full calendar years with one verified History Core geometry are compared to Runivers year intervals.',
      rangeMonthCount: rangeMonths.length,
      comparedMonthCount: comparableMonths.length,
      excludedMonthCount,
      excludedYears,
      externalOutage: true,
    },
  };
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.error(`Runivers preflight failed for ${startMonth}..${endMonth}; recording external outage without attempting ${discovery.vectorLayers.length} doomed live exports.`);
  process.exitCode = 1;
} else {
  const child = spawnSync(process.execPath, ['--import', path.join(root, 'scripts', 'runivers-fetch-cache.mjs'), validatorFile], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      RUNIVERS_DISCOVERY_FILE: shardDiscoveryFile,
    },
  });
  if (child.error) throw child.error;

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
}
