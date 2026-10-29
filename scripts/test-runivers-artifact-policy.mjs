import assert from 'node:assert/strict';
import fs from 'node:fs';

// Public CI artifacts must not archive ephemeral Runivers source geometry,
// the shard working directory, or the full generated month index.
const workflow = fs.readFileSync('.github/workflows/runivers-baseline-discovery.yml', 'utf8');
const marker = '      - name: Upload Runivers audit reports\n';
assert.equal(workflow.split(marker).length, 2, 'expected exactly one Runivers artifact upload step');
const upload = workflow.split(marker)[1].split(/\n      - name: /, 1)[0];
assert.match(upload, /uses: actions\/upload-artifact@v4/, 'expected reviewed upload-artifact step');
assert.match(upload, /retention-days: 7(?:\s|$)/, 'public diagnostics must expire after seven days');
const pathBlock = upload.match(/\n          path: \|\n((?:            .*\n)+)/);
assert.ok(pathBlock, 'artifact path must be an explicit multiline allowlist');
const paths = pathBlock[1].trim().split(/\n/).map(line => line.trim());
assert.deepEqual(paths, ['tmp/runivers-regression/report.json'],
  'only the reviewed geometry-free JSON report may be uploaded');
assert.doesNotMatch(upload, /reference-cache|runivers-shards|runivers-discovery/,
  'never upload the source cache or shard working files');
console.log('Runivers public artifact allowlist and seven-day retention: OK');
