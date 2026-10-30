import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'runivers-shard-'));
try {
  fs.mkdirSync(path.join(fixture, 'scripts'), {recursive: true});
  fs.mkdirSync(path.join(fixture, 'public/data/history-core/generated'), {recursive: true});
  fs.mkdirSync(path.join(fixture, 'tmp/runivers-regression'), {recursive: true});
  fs.copyFileSync(new URL('./runivers-regression-shard-runner.mjs', import.meta.url), path.join(fixture, 'scripts/runner.mjs'));
  fs.writeFileSync(path.join(fixture, 'scripts/runivers-fetch-cache.mjs'), '');
  fs.writeFileSync(path.join(fixture, 'probe.mjs'), `
    import fs from 'node:fs';
    let active = 0, peak = 0, requests = 0, cancelled = 0;
    process.on('exit', () => fs.writeFileSync('probe-stats.json', JSON.stringify({peak, requests, cancelled})));
    globalThis.fetch = async url => {
      active += 1;
      requests += 1;
      peak = Math.max(peak, active);
      // Force overlapping requests to expose excessive parallelism.
      await new Promise(resolve => setTimeout(resolve, 3));
      active -= 1;
      const address = String(url);
      const requested = process.env.TEST_ONLY_TRANSPORT;
      const transportMatches = requested === 'feature'
        ? address.includes('/feature/?srs=4326&geom_format=geojson') && !address.includes('limit=')
        : requested === 'export'
          ? address.includes('/export?format=GeoJSON&srs=4326&zipped=False&fid=ngw_id&encoding=UTF-8')
          : requested === 'geojson'
            ? address.endsWith('/geojson')
            : address.includes('/api/component/feature_layer/mvt');
      const resourceId = address.match(/\\/api\\/resource\\/(\\d+)\\//)?.[1]
        ?? new URL(address).searchParams.get('resource');
      if (process.env.TEST_NETWORK_ERROR && address.endsWith('/geojson')) {
        throw new Error('simulated network failure');
      }
      const ok = !process.env.TEST_OUTAGE && transportMatches
        && (!process.env.TEST_FIRST_RESOURCE_DOWN || resourceId === '2');
      return {ok, status: ok ? 200 : 503, body: {cancel: async () => { cancelled += 1; }}};
    };
  `);
  fs.writeFileSync(path.join(fixture, 'scripts/validate-runivers-regression.mjs'), `
    import fs from 'node:fs';
    const shard = JSON.parse(fs.readFileSync(process.env.RUNIVERS_MONTH_INDEX_FILE));
    fs.writeFileSync('child-input.json', JSON.stringify(shard));
    const sources = JSON.parse(fs.readFileSync(process.env.RUNIVERS_DISCOVERY_FILE));
    fs.writeFileSync('child-discovery.json', JSON.stringify(sources.vectorLayers));
    if (!process.env.TEST_NO_REPORT) {
      const auditedRange = process.env.TEST_MISSING_AUDITED_RANGE ? undefined : {
        startMonth: process.env.TEST_AUDITED_START || process.env.RUNIVERS_START_MONTH,
        endMonth: process.env.TEST_AUDITED_END || process.env.RUNIVERS_END_MONTH,
      };
      fs.writeFileSync('tmp/runivers-regression/report.json', JSON.stringify({summary: {comparisons: 1, auditedRange}}));
    }
    process.exitCode = Number(process.env.TEST_EXIT || 0);
  `);
  const months = [1991, 1992, 1993, 1994].flatMap(year => Array.from({length: 12}, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    status: 'geometry-verified',
    geometryFile: year === 1993 && i > 5 ? 'new.geojson' : 'old.geojson',
  })));
  const canonical = JSON.stringify({complete: true, monthCount: months.length, months});
  const canonicalPath = path.join(fixture, 'public/data/history-core/generated/month-index.json');
  fs.writeFileSync(canonicalPath, canonical);
  const discoveryPath = path.join(fixture, 'baseline.json');
  fs.writeFileSync(discoveryPath, JSON.stringify({host: 'https://example.invalid', preferredMaxYear: 2020,
    vectorLayers: [{id: 1, fromYear: 1991, toYear: 2000}, {id: 2, fromYear: 1992, toYear: 2000}]}));
  const reportPath = path.join(fixture, 'tmp/runivers-regression/report.json');
  const run = extra => spawnSync(process.execPath, ['scripts/runner.mjs'], {
    cwd: fixture, encoding: 'utf8', env: {...process.env,
      NODE_OPTIONS: `--import=${path.join(fixture, 'probe.mjs')}`,
      RUNIVERS_DISCOVERY_FILE: discoveryPath, RUNIVERS_START_MONTH: '1992-01', RUNIVERS_END_MONTH: '1993-12', ...extra},
  });
  for (const code of [0, 1]) {
    const result = run({TEST_EXIT: String(code)});
    assert.equal(result.status, code, result.stderr);
    assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical, 'canonical index must be byte-identical after every shard');
    const input = JSON.parse(fs.readFileSync(path.join(fixture, 'child-input.json')));
    assert.equal(input.monthCount, 12);
    assert.equal(input.months.length, 12);
    assert.equal(input.minMonth, '1992-01');
    assert.equal(input.maxMonth, '1992-12');
    assert.equal(input.complete, false);
    const report = JSON.parse(fs.readFileSync(reportPath));
    assert.equal(report.shard.excludedMonthCount, 12);
    assert.equal(report.shard.excludedYears[0].year, 1993);
  }
  // A successful validator process cannot substitute a report for another
  // interval. In particular, the runner must never overwrite the child's
  // auditedRange with its own requested dates before the acceptance gate.
  for (const extra of [
    {TEST_AUDITED_START: '1991-01'},
    {TEST_AUDITED_END: '1994-12'},
    {TEST_MISSING_AUDITED_RANGE: '1'},
  ]) {
    const mismatched = run(extra);
    assert.equal(mismatched.status, 1, 'mismatched or absent child audit dates must fail closed');
    assert.match(mismatched.stderr, /not requested shard/,
      'wrong-period child audit must be diagnosed');
    const report = JSON.parse(fs.readFileSync(reportPath));
    assert.equal(report.shard.startMonth, '1992-01');
    assert.equal(report.shard.endMonth, '1993-12');
    assert.notDeepEqual(report.summary.auditedRange, {
      startMonth: '1992-01', endMonth: '1993-12',
    }, 'the runner must preserve the original validator audit dates');
  }
  // A full year with unchanged polygon coordinates can still contain a
  // political or evidentiary transition. Runivers cannot date that transition.
  for (const [field, value] of [
    ['polityId', 'russian-empire'],
    ['snapshotId', 'different-snapshot'],
    ['certificationId', 'different-certificate'],
    ['verificationClass', 'reconstruction'],
    ['uncertaintyMeters', 25000],
    ['track', 'different-track'],
    ['territorialModel', 'different-territorial-model'],
    ['uncertaintyGeometryFile', 'uncertainty-different.geojson'],
    ['confidence', 'reconstructed'],
    ['evidenceDocumentIds', ['different-evidence']],
    ['derivedFromChangeIds', ['different-change']],
  ]) {
    const changed = JSON.parse(canonical);
    for (const row of changed.months) {
      if (row.month.startsWith('1993-')) row.geometryFile = 'old.geojson';
      if (row.month >= '1992-07' && row.month <= '1992-12') row[field] = value;
    }
    fs.writeFileSync(canonicalPath, JSON.stringify(changed));
    const result = run({});
    assert.equal(result.status, 0, `${field}: ${result.stderr}`);
    const input = JSON.parse(fs.readFileSync(path.join(fixture, 'child-input.json')));
    assert.equal(input.monthCount, 12, `${field}: changed state must not count as a full-year match`);
    assert.equal(input.minMonth, '1993-01');
    assert.equal(input.maxMonth, '1993-12');
    const report = JSON.parse(fs.readFileSync(reportPath));
    assert.equal(report.shard.excludedYears[0].year, 1992);
    assert.equal(report.shard.excludedYears[0].geometryCount, 1,
      `${field}: same polygon must not hide a historical transition`);
    assert.equal(report.shard.excludedYears[0].historicalStateCount, 2);
    assert.equal(fs.readFileSync(canonicalPath, 'utf8'), JSON.stringify(changed),
      'the comparison must not modify canonical history');
  }
  fs.writeFileSync(canonicalPath, canonical);
  assert.equal(run({TEST_EXIT: '1', TEST_NO_REPORT: '1'}).status, 1);
  assert.equal(fs.existsSync(reportPath), false, 'failed validator must not reuse a stale report');
  const missingSuccessfulReport = run({TEST_EXIT: '0', TEST_NO_REPORT: '1'});
  assert.equal(missingSuccessfulReport.status, 1,
    'a zero-exit validator without an audit report must fail closed');
  assert.match(missingSuccessfulReport.stderr, /validator produced no report/,
    'missing report should be diagnosed explicitly');
  assert.equal(fs.existsSync(reportPath), false,
    'zero-exit validator must not leave or reuse an old audit report');
  fs.writeFileSync(reportPath, JSON.stringify({summary: {comparisons: 1}}));
  assert.equal(run({RUNIVERS_START_MONTH: 'invalid'}).status, 1);
  assert.equal(fs.existsSync(reportPath), false, 'invalid input must also remove an old report');
  assert.equal(run({RUNIVERS_START_MONTH: '1992-00'}).status, 1, 'month zero must be rejected');
  assert.equal(run({RUNIVERS_END_MONTH: '1993-13'}).status, 1, 'month thirteen must be rejected');
  const incomplete = JSON.parse(canonical);
  incomplete.months = incomplete.months.filter(row => row.month !== '1993-06');
  fs.writeFileSync(canonicalPath, JSON.stringify(incomplete));
  const missing = run({});
  assert.equal(missing.status, 1, 'missing month must fail the shard before preflight');
  assert.match(missing.stderr, /missing 1 month/);
  assert.equal(fs.existsSync(reportPath), false, 'missing month must not reuse a passing report');
  incomplete.months.push({month: '1993-05', status: 'geometry-verified', geometryFile: 'old.geojson'});
  fs.writeFileSync(canonicalPath, JSON.stringify(incomplete));
  const duplicate = run({});
  assert.equal(duplicate.status, 1, 'duplicate month must fail the shard before preflight');
  assert.match(duplicate.stderr, /Duplicate History Core month/);
  fs.writeFileSync(canonicalPath, canonical);
  const missingYear = JSON.parse(canonical);
  missingYear.months = missingYear.months.filter(row => !row.month.startsWith('1993-'));
  fs.writeFileSync(canonicalPath, JSON.stringify(missingYear));
  const absentYear = run({});
  assert.equal(absentYear.status, 1, 'an entirely absent year must not disappear from coverage');
  assert.match(absentYear.stderr, /missing 12 months/);
  assert.equal(fs.existsSync(reportPath), false, 'an absent year must not reuse a passing report');
  fs.writeFileSync(canonicalPath, canonical);
  // Chained Runivers intervals are half-open: a layer ending in the first
  // shard year must not be counted as a reference for that year. Likewise,
  // a layer starting after the shard cannot count as discovered coverage.
  const originalDiscoveryForIntervals = fs.readFileSync(discoveryPath, 'utf8');
  const intervalFixture = JSON.parse(originalDiscoveryForIntervals);
  intervalFixture.vectorLayers.push(
    {id: 9, fromYear: 1990, toYear: 1992},
    {id: 10, fromYear: 1994, toYear: 1995},
  );
  fs.writeFileSync(discoveryPath, JSON.stringify(intervalFixture));
  const halfOpen = run({});
  assert.equal(halfOpen.status, 0, halfOpen.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'child-discovery.json')))
    .map(layer => layer.id), [1, 2],
  'a half-open source ending at the shard start and a later source must both be excluded');
  fs.writeFileSync(discoveryPath, originalDiscoveryForIntervals);

  // The final baseline year is the documented exception: its terminal
  // endpoint is inclusive. Do not accidentally drop the 2020 reference.
  const terminalMonths = Array.from({length: 12}, (_, i) => ({
    month: `2020-${String(i + 1).padStart(2, '0')}`,
    status: 'geometry-verified', geometryFile: 'terminal.geojson',
  }));
  fs.writeFileSync(canonicalPath, JSON.stringify({
    complete: false, monthCount: 12, months: terminalMonths,
  }));
  fs.writeFileSync(discoveryPath, JSON.stringify({
    host: 'https://example.invalid', preferredMaxYear: 2020,
    vectorLayers: [{id: 3, fromYear: 2018, toYear: 2020}],
  }));
  const terminal = run({RUNIVERS_START_MONTH: '2020-01', RUNIVERS_END_MONTH: '2020-12'});
  assert.equal(terminal.status, 0, terminal.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture, 'child-discovery.json')))
    .map(layer => layer.id), [3],
  'the final pinned Runivers year must remain included');
  fs.writeFileSync(canonicalPath, canonical);
  fs.writeFileSync(discoveryPath, originalDiscoveryForIntervals);

  const firstDown = run({TEST_FIRST_RESOURCE_DOWN: '1'});
  assert.equal(firstDown.status, 0, firstDown.stderr);
  assert.match(firstDown.stdout, /responsive resource 2 via component-mvt/,
    'the second layer must recover a shard and identify its successful transport');
  assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical, 'a recovered shard must not mutate canonical data');
  // A complete outage is only real when EVERY transport the fetcher uses is
  // unavailable. Earlier preflight omitted export and /geojson, and its
  // feature URL added a limit parameter not used by the actual fetcher.
  for (const transport of ['feature', 'export', 'geojson']) {
    const fallback = run({TEST_ONLY_TRANSPORT: transport, TEST_FIRST_RESOURCE_DOWN: '1'});
    assert.equal(fallback.status, 0, `${transport}: ${fallback.stderr}`);
    assert.match(fallback.stdout, /responsive resource 2/,
      `${transport}: later resource with a usable fallback must prevent a false outage`);
    assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical,
      `${transport}: fallback preflight must not modify canonical history`);
  }
  assert.equal(run({TEST_OUTAGE: '1'}).status, 1);
  const stats = JSON.parse(fs.readFileSync(path.join(fixture, 'probe-stats.json')));
  assert.ok(stats.requests >= 6, 'a total outage must probe all available transports and resources');
  assert.ok(stats.peak <= 2, `preflight request peak must not exceed two, got ${stats.peak}`);
  assert.equal(stats.cancelled, stats.requests, 'every preflight response body must be closed');
  const outageReport = JSON.parse(fs.readFileSync(reportPath));
  assert.equal(outageReport.summary.externalOutage, true);
  assert.equal(outageReport.schema_version, 2, 'outage reports must use the same evidence schema as normal regression reports');
  assert.deepEqual(outageReport.comparisonEvidence, [],
    'a complete preflight outage must explicitly record zero independent geographic comparisons');
  assert.deepEqual(outageReport.summary.preflightProbeResults.map(row => row.resourceId), [1, 2],
    'every probed source must be identified, including later fallbacks');
  for (const row of outageReport.summary.preflightProbeResults) {
    assert.deepEqual(row.probes.map(probe => probe.transport),
      ['resource-mvt', 'component-mvt', 'feature-json', 'export-json', 'geojson'],
      'all five transport outcomes must survive a complete outage');
    assert.ok(row.probes.every(probe => probe.outcome === 'http-503'),
      'failed HTTP responses must be recorded as failures, not geometry passes');
  }
  assert.match(outageReport.referenceFailures[0].error, /all five MVT\/JSON endpoints/,
    'outage description must not omit the export and GeoJSON fallbacks');
  assert.ok(!JSON.stringify(outageReport.summary.preflightProbeResults).includes('coordinates'),
    'preflight evidence must not include reference geometry');
  const networkFailure = run({TEST_OUTAGE: '1', TEST_NETWORK_ERROR: '1'});
  assert.equal(networkFailure.status, 1);
  const networkReport = JSON.parse(fs.readFileSync(reportPath));
  assert.ok(networkReport.summary.preflightProbeResults.every(row =>
    row.probes.at(-1).outcome === 'network-error'),
    'network failures must be distinguishable from HTTP failures');
  assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical, 'outage must not mutate canonical data');
  // The map starts in 0862. Even though the present Runivers baseline starts
  // in 1462, shard integrity must preserve the zero-padded early-year keys.
  const originalDiscovery = fs.readFileSync(discoveryPath, 'utf8');
  const earlyMonths = Array.from({length: 12}, (_, i) => ({
    month: `0862-${String(i + 1).padStart(2, '0')}`,
    status: 'geometry-verified',
    geometryFile: 'early.geojson',
  }));
  fs.writeFileSync(canonicalPath, JSON.stringify({complete: false, monthCount: 12, months: earlyMonths}));
  fs.writeFileSync(discoveryPath, JSON.stringify({host: 'https://example.invalid', preferredMaxYear: 2020,
    vectorLayers: [{id: 2, fromYear: 862, toYear: 863}]}));
  const early = run({RUNIVERS_START_MONTH: '0862-01', RUNIVERS_END_MONTH: '0862-12'});
  assert.equal(early.status, 0, early.stderr);
  const earlyShard = JSON.parse(fs.readFileSync(path.join(fixture, 'child-input.json')));
  assert.equal(earlyShard.minMonth, '0862-01');
  assert.equal(earlyShard.maxMonth, '0862-12');
  assert.equal(earlyShard.months.length, 12);
  fs.writeFileSync(canonicalPath, canonical);
  fs.writeFileSync(discoveryPath, originalDiscovery);
  console.log('Runivers shard tests passed: bounded preflight concurrency, released probe bodies, all five transport outcomes and network errors, fallback parity, first-layer recovery, canonical isolation, full-state transition exclusion, missing-month/whole-year rejection, early-year keys, failure propagation, stale-report removal, total outage.');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
