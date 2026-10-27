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
// Even an early input failure must not leave an older passing report.
fs.rmSync(reportFile, {force: true});

const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '');
if (!validMonth(startMonth) || !validMonth(endMonth) || startMonth > endMonth) {
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
// Excluding within-year transitions is intentional; silently dropping entire
// missing years is not. Check the calendar range before computing comparable
// years, so an incomplete index cannot produce a misleading green regression.
const expectedMonths = [];
for (let year = startYear, month = Number(startMonth.slice(5)); year < endYear || (year === endYear && month <= Number(endMonth.slice(5))); month += 1) {
  if (month > 12) { month = 1; year += 1; }
  expectedMonths.push(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`);
}
const seenMonths = new Set();
for (const row of rangeMonths) {
  if (seenMonths.has(row.month)) throw new Error(`Duplicate History Core month in Runivers shard: ${row.month}`);
  seenMonths.add(row.month);
}
const missingMonths = expectedMonths.filter(key => !seenMonths.has(key));
if (missingMonths.length) throw new Error(`History Core Runivers shard is missing ${missingMonths.length} months (${missingMonths.slice(0, 5).join(', ')}); comparison cannot certify the requested range.`);

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
  // Reusing the same polygon does not prove the same historical state.
  // A polity, source snapshot, certification, or uncertainty change inside
  // the year cannot be dated by Runivers's year-granular reference.
  const states = new Set(verifiedRows.map((row) => JSON.stringify([
    row.geometryFile, row.polityId ?? null, row.snapshotId ?? null,
    row.certificationId ?? null, row.verificationClass ?? null,
    row.uncertaintyMeters ?? null, row.track ?? null,
    row.territorialModel ?? null, row.uncertaintyGeometryFile ?? null,
    row.confidence ?? null,
    [...(row.evidenceDocumentIds ?? [])].sort(),
    [...(row.derivedFromChangeIds ?? [])].sort(),
  ])));
  const months = new Set(verifiedRows.map((row) => row.month.slice(5, 7)));
  if (rows.length === 12 && verifiedRows.length === 12 && states.size === 1 && months.size === 12) {
    comparableYears.add(year);
  } else {
    excludedYears.push({
      year: Number(year),
      monthCount: rows.length,
      verifiedMonthCount: verifiedRows.length,
      geometryCount: geometries.size,
      historicalStateCount: states.size,
      reason: 'Runivers is year-granular; History Core changes geometry, polity, snapshot, evidence, territorial model, confidence or uncertainty within this calendar year, or lacks one full-year verified state',
    });
  }
}

const comparableMonths = rangeMonths.filter((row) => comparableYears.has(row.month.slice(0, 4)));
if (!comparableMonths.length) {
  throw new Error(`No full-calendar-year History Core states can be compared to year-granular Runivers in ${startMonth}..${endMonth}`);
}
// A regression shard must never replace the canonical 13,980-month index.
const shardMonthIndexFile = path.join(shardDir, 'month-index.json');
fs.writeFileSync(shardMonthIndexFile, JSON.stringify({
  ...monthIndex,
  months: comparableMonths,
  monthCount: comparableMonths.length,
  minMonth: comparableMonths[0].month,
  maxMonth: comparableMonths.at(-1).month,
  complete: false,
}, null, 2));

const excludedMonthCount = rangeMonths.length - comparableMonths.length;
console.log(`Runivers shard ${startMonth}..${endMonth}: ${discovery.vectorLayers.length}/${originalLayers.length} layers; ${comparableMonths.length}/${rangeMonths.length} shard months are unambiguous full-year comparisons (${excludedMonthCount} boundary/transition months excluded from the year-granular cross-check).`);

async function probe(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {signal: controller.signal, redirect: 'follow'});
    const available = response.ok;
    // Preflight needs only the HTTP status. Release the unread response body so
    // many large MVT/GeoJSON probes cannot exhaust sockets or retain buffers.
    try { await response.body?.cancel(); } catch { /* Already closed by the server. */ }
    return available;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function runiversHealthy() {
  const host = String(discovery.host || '').replace(/\/$/, '');
  const ids = [...new Set(discovery.vectorLayers.map(layer => layer.id).filter(Number.isInteger))];
  if (!host || !ids.length) return {healthy: false, probedResourceIds: [], responsiveResourceId: null};

  // A Runivers shard may have dozens of dated layers. The first layer can be
  // temporarily unavailable while later layers still provide valid reference
  // data. Never classify the *whole* shard as an external outage from one id.
  const order = [...new Set([ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)]),
    ...ids.filter(id => ![ids[0], ids[Math.floor(ids.length / 2)], ids.at(-1)].includes(id))];
  const probedResourceIds = [];
  // Keep preflight no more concurrent than the actual geometry fetcher.
  // The former four resources x three endpoints produced twelve simultaneous
  // requests and could itself trigger throttling / false external outages.
  for (let offset = 0; offset < order.length; offset += 2) {
    const batch = order.slice(offset, offset + 2);
    const results = await Promise.all(batch.map(async id => {
      const urls = [
        `${host}/api/resource/${id}/0/0/0.mvt`,
        `${host}/api/component/feature_layer/mvt?resource=${id}&z=0&x=0&y=0&simplification=0`,
        // Match all transports used by runivers-fetch-cache.mjs. An outage
        // must not be inferred when the feature, export or GeoJSON fallback
        // is healthy; the old preflight omitted two and changed the feature URL.
        `${host}/api/resource/${id}/feature/?srs=4326&geom_format=geojson`,
        `${host}/api/resource/${id}/export?format=GeoJSON&srs=4326&zipped=False&fid=ngw_id&encoding=UTF-8`,
        `${host}/api/resource/${id}/geojson`,
      ];
      // Try the transports in order. Do not hammer all three at once when the
      // first transport is already healthy; fallbacks remain fully checked.
      for (const url of urls) if (await probe(url)) return true;
      return false;
    }));
    probedResourceIds.push(...batch);
    const successfulIndex = results.indexOf(true);
    if (successfulIndex !== -1) return {
      healthy: true, probedResourceIds, responsiveResourceId: batch[successfulIndex],
    };
  }
  return {healthy: false, probedResourceIds, responsiveResourceId: null};
}

const preflight = await runiversHealthy();
if (!preflight.healthy) {
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
      preflightResourceIds: preflight.probedResourceIds,
    },
    stateCoverage: [],
    failedComparisons: [],
    referenceFailures: [{error: 'Runivers preflight failed on canonical MVT, component MVT and WGS84 feature endpoints for every dated resource', probedResourceIds: preflight.probedResourceIds}],
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
  console.error(`Runivers preflight failed for ${startMonth}..${endMonth} across ${preflight.probedResourceIds.length} resources; recording external outage without attempting ${discovery.vectorLayers.length} doomed live exports.`);
  process.exitCode = 1;
} else {
  console.log(`Runivers preflight: responsive resource ${preflight.responsiveResourceId} among ${preflight.probedResourceIds.length} probed, proceeding with the complete shard.`);
  const child = spawnSync(process.execPath, ['--import', path.join(root, 'scripts', 'runivers-fetch-cache.mjs'), validatorFile], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      RUNIVERS_DISCOVERY_FILE: shardDiscoveryFile,
      RUNIVERS_MONTH_INDEX_FILE: shardMonthIndexFile,
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
