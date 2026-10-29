import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assertDeployIdentity, verifyLiveDeploy} from './verify-live-territory-deploy.mjs';

const sha = 'a'.repeat(40);
const runId = '40800230699';
const marker = {sha, run_id: runId, built_at: '2026-10-29T01:25:00Z'};
assert.doesNotThrow(() => assertDeployIdentity(marker, sha, runId));
assert.throws(() => assertDeployIdentity({...marker, sha: 'b'.repeat(40)}, sha, runId), /SHA does not match/);
assert.throws(() => assertDeployIdentity({...marker, run_id: '40800230700'}, sha, runId), /run ID does not match/);
assert.throws(() => assertDeployIdentity({}, sha, runId), /SHA does not match/);
assert.throws(() => assertDeployIdentity(marker, 'a'.repeat(7), runId), /full commit SHA/);

const response = (value, status = 200) => ({ok: status === 200, status, json: async () => value});
let calls = 0;
const verified = await verifyLiveDeploy({
  expectedSha: sha, expectedRunId: runId, attempts: 3, retryDelayMs: 0,
  sleep: async () => {},
  fetchImpl: async (url, options) => {
    calls += 1;
    assert.match(url, /\/deploy\.json$/);
    assert.equal(options.cache, 'no-store');
    return calls === 1 ? response(null, 503) : response(marker);
  },
});
assert.equal(verified.sha, sha);
assert.equal(calls, 2, 'a transient CDN failure must be retried');
for (const badMarker of [{...marker, sha: 'b'.repeat(40)}, {...marker, run_id: '123'}, {}]) {
  await assert.rejects(verifyLiveDeploy({
    expectedSha: sha, expectedRunId: runId, attempts: 2, retryDelayMs: 0,
    sleep: async () => {}, fetchImpl: async () => response(badMarker),
  }), /could not be confirmed/);
}
await assert.rejects(verifyLiveDeploy({
  expectedSha: sha, expectedRunId: runId, attempts: 1,
  fetchImpl: async () => {throw new Error('offline');},
}), /offline/);
let networkCalled = false;
await assert.rejects(verifyLiveDeploy({
  expectedSha: 'invalid', expectedRunId: runId,
  fetchImpl: async () => {networkCalled = true; return response(marker);},
}), /full commit SHA/);
assert.equal(networkCalled, false);

// Downstream Chromium must test the exact Pages revision, not the latest main.
const workflow = fs.readFileSync(new URL('../.github/workflows/validate-territory-browser.yml', import.meta.url), 'utf8');
assert.match(workflow, /name: Checkout deployed Pages revision[\s\S]*?ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
assert.match(workflow, /name: Confirm exact live Pages revision before Chromium[\s\S]*?EXPECTED_DEPLOY_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
assert.match(workflow, /EXPECTED_PAGES_RUN_ID: \$\{\{ github\.event\.workflow_run\.id \}\}/);
assert.match(workflow, /run: node scripts\/verify-live-territory-deploy\.mjs/);
console.log('Live territory SHA/run guard passed: identity, retry, fail-closed, and exact workflow checkout.');
