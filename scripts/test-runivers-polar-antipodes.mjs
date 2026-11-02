import assert from 'node:assert/strict';
import {hasValidWgs84Line, hasAntipodalPoleEdge, hasRepeatedPoleVisit} from './runivers-line-topology.mjs';
import {hasValidRingTopology, hasValidPolygonTopology} from './runivers-ring-topology.mjs';
import {requireUsableReferenceGeometry} from './validate-runivers-regression.mjs';

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

// Non-adjacent visits to the same geographic pole are the same physical
// point even when the longitudes differ. The previous segment-only check
// accepted these self-touching auxiliary lines as independent evidence.
for (const line of [
  [[0, 90], [20, 80], [60, 90]],
  [[10, -90], [40, -80], [-50, -90]],
  [[0, 90], [30, 80], [60, -90], [90, -80], [120, 90]],
]) {
  assert.equal(hasAntipodalPoleEdge(line), false);
  assert.equal(hasRepeatedPoleVisit(line), true);
  assert.equal(hasValidWgs84Line(line), false);
}
assert.equal(hasRepeatedPoleVisit([[0, 90], [30, 80], [60, -90]]), false);
assert.equal(hasValidWgs84Line([[0, 90], [30, 80], [60, -90]]), true);
assert.equal(hasRepeatedPoleVisit([[0, 0], [30, 80], [60, 0]]), false);
assert.equal(hasValidWgs84Line([[0, 0], [30, 80], [60, 0]]), true);
assert.equal(hasRepeatedPoleVisit(null), false);

// Preserve legitimate single-pole rings and short antimeridian crossings.
const singlePoleRing = [[0, 90], [30, 80], [-30, 80], [0, 90]];
assert.equal(hasValidRingTopology(singlePoleRing), true);
assert.equal(hasValidPolygonTopology([singlePoleRing]), true);
assert.equal(hasValidWgs84Line([[170, 80], [-170, 80]]), true);
assert.equal(hasValidWgs84Line([[0, 90], [30, 80]]), true);
assert.equal(hasAntipodalPoleEdge([[0, 90], [30, 80]]), false);

// GeoJSON polygon rings are closed: their last pole coordinate repeats the
// first by definition. The transport preflight must use the ring topology
// gate, not the stricter open-LineString repeated-pole rule. Previously this
// perfectly valid single-pole ring was rejected as a malformed export.
const polarFeature = ring => ({type: 'Feature', properties: {name: 'synthetic'},
  geometry: {type: 'Polygon', coordinates: [ring]}});
assert.equal(requireUsableReferenceGeometry(polarFeature(singlePoleRing), 'synthetic-pole').hasPolygon, true,
  'valid single-pole polygon must remain usable for independent comparison');
for (const ring of [
  antipodalRing,
  [[0, 90], [20, 80], [60, 90], [80, 80], [0, 90]],
]) {
  assert.throws(() => requireUsableReferenceGeometry(polarFeature(ring), 'synthetic-invalid-pole'),
    /malformed polygon rings/,
    'antipodal or multiply visited poles must remain invalid in source transport');
}
const mixedPolarFeature = {type: 'Feature', properties: {}, geometry: {
  type: 'GeometryCollection', geometries: [
    polarFeature(singlePoleRing).geometry,
    {type: 'LineString', coordinates: [[0, 90], [20, 80], [60, 90]]},
  ],
}};
assert.throws(() => requireUsableReferenceGeometry(mixedPolarFeature, 'synthetic-invalid-line'),
  /malformed or unsupported geometry/,
  'fixing ring closure must not weaken the auxiliary LineString integrity gate');

console.log('Runivers antipodal pole-edge integrity passed.');
