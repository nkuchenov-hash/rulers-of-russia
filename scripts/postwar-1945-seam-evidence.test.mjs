// Evidence-only regression for the *current* 1945 USSR snapshot.
// This is a characterization test of a known topology failure, NOT an
// acceptance test or independent historical boundary validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectSeam } from './postwar-seam-audit.mjs';

const snapshot = new URL('../public/data/territory/world-history/snapshots/1945.geojson', import.meta.url);
const doc = JSON.parse(fs.readFileSync(snapshot, 'utf8'));

test('1945 USSR: preserve quantitative antimeridian conflict evidence', () => {
  const result = inspectSeam(doc);
  assert.equal(result.polygonCount, 24);
  assert.equal(result.seamRingCount, 2);
  assert.equal(result.seamEdgeOverlaps.length, 7);
  assert.deepEqual(result.overlapByComponentPair, [{
    polygonIndices: [1, 2], sourceEdgePairs: 7,
    mergedIntervals: [[65.25922735782032, 68.91692694278126]],
    overlapLatitudeDegrees: 3.6576995849609375
  }]);
  assert.equal(result.contacts.length, 5);
  assert.equal(result.uniqueContactCount, 4);
  assert.equal(result.mergedSeamOverlapIntervals.length, 1);
  const [lo, hi] = result.mergedSeamOverlapIntervals[0];
  assert.ok(Math.abs(lo - 65.25922735782032) < 1e-9);
  assert.ok(Math.abs(hi - 68.91692694278126) < 1e-9);
  assert.ok(Math.abs(result.seamOverlapLatitudeDegrees - 3.6576995849609375) < 1e-9);
  assert.ok(result.seamEdgeOverlaps.some(x =>
    x.a[0] === 1 && x.b[0] === 2 &&
    Math.abs(x.latitudeInterval[0] - 65.3816333636797) < 1e-9 &&
    Math.abs(x.latitudeInterval[1] - 65.96313055606251) < 1e-9
  ), 'retain source-edge provenance for the known strict topology collision');
});
