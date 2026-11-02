import assert from 'node:assert/strict';
import {hasValidWgs84Line, hasAntipodalPoleEdge} from './runivers-line-topology.mjs';
import {hasValidRingTopology, hasValidPolygonTopology} from './runivers-ring-topology.mjs';

// Both poles are antipodal regardless of longitude. A meridian-like edge
// between them is not a unique geodesic and must not certify a source border.
for (const line of [
  [[0, 90], [0, -90]],
  [[35, -90], [35, 90]],
  [[170, 90], [-170, -90]],
]) {
  assert.equal(hasAntipodalPoleEdge(line), true);
  assert.equal(hasValidWgs84Line(line), false);
}
const antipodalRing = [[0, 90], [0, -90], [30, -80], [30, 80], [0, 90]];
assert.equal(hasValidRingTopology(antipodalRing), false);
assert.equal(hasValidPolygonTopology([antipodalRing]), false);
assert.equal(hasValidPolygonTopology([[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], antipodalRing]), false,
  'an invalid hole must not be silently accepted');

// Preserve legitimate single-pole rings and short antimeridian crossings.
const singlePoleRing = [[0, 90], [30, 80], [-30, 80], [0, 90]];
assert.equal(hasValidRingTopology(singlePoleRing), true);
assert.equal(hasValidPolygonTopology([singlePoleRing]), true);
assert.equal(hasValidWgs84Line([[170, 80], [-170, 80]]), true);
assert.equal(hasValidWgs84Line([[0, 90], [30, 80]]), true);
assert.equal(hasAntipodalPoleEdge([[0, 90], [30, 80]]), false);

console.log('Runivers antipodal pole-edge integrity passed.');
