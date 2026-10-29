import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const LIVE_DEPLOY_MARKER_URL = 'https://nkuchenov-hash.github.io/rulers-of-russia/deploy.json';

export function assertDeployIdentity(marker, expectedSha, expectedRunId) {
  assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/, 'Expected deployed SHA must be a full commit SHA');
  assert.match(String(expectedRunId ?? ''), /^[1-9]\d*$/, 'Expected Pages run ID must be a positive integer');
  assert(marker && typeof marker === 'object' && !Array.isArray(marker), 'Live deploy marker must be an object');
  assert.equal(marker.sha, expectedSha, 'Live Pages SHA does not match the completed Pages workflow');
  assert.equal(String(marker.run_id ?? ''), String(expectedRunId), 'Live Pages run ID does not match the triggering deployment');
}

export async function verifyLiveDeploy({
  expectedSha,
  expectedRunId,
  url = LIVE_DEPLOY_MARKER_URL,
  fetchImpl = fetch,
  attempts = 8,
  retryDelayMs = 2000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  // Validate trusted workflow inputs before any network requests.
  assert.match(expectedSha ?? '', /^[0-9a-f]{40}$/, 'Expected deployed SHA must be a full commit SHA');
  assert.match(String(expectedRunId ?? ''), /^[1-9]\d*$/, 'Expected Pages run ID must be a positive integer');
  assert(Number.isInteger(attempts) && attempts > 0, 'Retry count must be positive');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {cache: 'no-store', headers: {'Cache-Control': 'no-cache'}});
      assert(response.ok, 'Live deploy marker returned HTTP ' + response.status);
      const marker = await response.json();
      assertDeployIdentity(marker, expectedSha, expectedRunId);
      return marker;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  throw new Error('Live territory SHA/run identity could not be confirmed after ' + attempts + ' attempt(s): ' + lastError?.message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const marker = await verifyLiveDeploy({
      expectedSha: process.env.EXPECTED_DEPLOY_SHA,
      expectedRunId: process.env.EXPECTED_PAGES_RUN_ID,
    });
    console.log('Verified live Pages revision ' + marker.sha + ' from Pages run ' + marker.run_id + ' before Chromium checks.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
