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
      const ok = !process.env.TEST_OUTAGE
        && String(url).includes('/api/component/feature_layer/mvt')
        && (!process.env.TEST_FIRST_RESOURCE_DOWN || String(url).includes('resource=2'));
      return {ok, body: {cancel: async () => { cancelled += 1; }}};
    };
  `);
  fs.writeFileSync(path.join(fixture, 'scripts/validate-runivers-regression.mjs'), `
    import fs from 'node:fs';
    const shard = JSON.parse(fs.readFileSync(process.env.RUNIVERS_MONTH_INDEX_FILE));
    fs.writeFileSync('child-input.json', JSON.stringify(shard));
    if (!process.env.TEST_NO_REPORT) fs.writeFileSync('tmp/runivers-regression/report.json', JSON.stringify({summary: {comparisons: 1}}));
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
  const firstDown = run({TEST_FIRST_RESOURCE_DOWN: '1'});
  assert.equal(firstDown.status, 0, firstDown.stderr);
  assert.match(firstDown.stdout, /responsive resource 2/, 'the second layer must recover a shard with a failed first layer');
  assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical, 'a recovered shard must not mutate canonical data');
  assert.equal(run({TEST_OUTAGE: '1'}).status, 1);
  const stats = JSON.parse(fs.readFileSync(path.join(fixture, 'probe-stats.json')));
  assert.ok(stats.requests >= 6, 'a total outage must probe all available transports and resources');
  assert.ok(stats.peak <= 2, `preflight request peak must not exceed two, got ${stats.peak}`);
  assert.equal(stats.cancelled, stats.requests, 'every preflight response body must be closed');
  assert.equal(JSON.parse(fs.readFileSync(reportPath)).summary.externalOutage, true);
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
  console.log('Runivers shard tests passed: bounded preflight concurrency, released probe bodies, component fallback, first-layer recovery, canonical isolation, full-state transition exclusion, missing-month/whole-year rejection, early-year keys, failure propagation, stale-report removal, total outage.');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
