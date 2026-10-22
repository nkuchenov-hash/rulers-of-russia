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
    globalThis.fetch = async url => new Response('', {status:
      !process.env.TEST_OUTAGE && String(url).includes('/api/component/feature_layer/mvt') ? 200 : 503});
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
    vectorLayers: [{id: 1, fromYear: 1991, toYear: 2000}]}));
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
  assert.equal(run({TEST_EXIT: '1', TEST_NO_REPORT: '1'}).status, 1);
  assert.equal(fs.existsSync(reportPath), false, 'failed validator must not reuse a stale report');
  fs.writeFileSync(reportPath, JSON.stringify({summary: {comparisons: 1}}));
  assert.equal(run({RUNIVERS_START_MONTH: 'invalid'}).status, 1);
  assert.equal(fs.existsSync(reportPath), false, 'invalid input must also remove an old report');
  assert.equal(run({TEST_OUTAGE: '1'}).status, 1);
  assert.equal(JSON.parse(fs.readFileSync(reportPath)).summary.externalOutage, true);
  assert.equal(fs.readFileSync(canonicalPath, 'utf8'), canonical, 'outage must not mutate canonical data');
  console.log('Runivers shard tests passed: component-only availability, canonical isolation, transition exclusion, failure propagation, stale-report removal, outage.');
} finally {
  fs.rmSync(fixture, {recursive: true, force: true});
}
