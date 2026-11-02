import assert from 'node:assert/strict';
import {hasValidPolygonTopology, polygonHoleTopologyFailureReason} from './runivers-ring-topology.mjs';
import {requireUsableReferenceGeometry} from './validate-runivers-regression.mjs';
import {normalizeExactDuplicatePolygonFeatures} from './runivers-lossless-geometry.mjs';
import {summarizePolygonFailures} from './runivers-polygon-failure-diagnostics.mjs';

const square = [[30, 50], [31, 50], [31, 51], [30, 51], [30, 50]];
const feature = ring => ({type: 'Feature', properties: {name: 'Россия'},
  geometry: {type: 'Polygon', coordinates: [ring]}});
const normalize = ring => normalizeExactDuplicatePolygonFeatures({
  type: 'FeatureCollection', features: [feature(ring)],
});
const withDuplicate = [[30, 50], [31, 50], [31, 50], [31, 51], [30, 51], [30, 50]];
assert.equal(hasValidPolygonTopology([withDuplicate]), false);
const result = normalize(withDuplicate);
assert.equal(result.removedVertices, 1);
assert.deepEqual(result.payload.features[0].geometry.coordinates[0], square);
assert.deepEqual(withDuplicate[2], [31, 50], 'original source coordinates must not be mutated');
assert.equal(requireUsableReferenceGeometry(result.payload, 'test').hasPolygon, true);

const trailing = normalize([...square, [30, 50]]);
assert.equal(trailing.removedVertices, 1);
assert.deepEqual(trailing.payload.features[0].geometry.coordinates[0], square);

const valid = normalize(square);
assert.equal(valid.removedVertices, 0);
assert.equal(valid.payload.features[0].geometry.coordinates[0], square,
  'already valid source must remain unchanged');

for (const ring of [
  [[30, 50], [31, 50], [31, 50], [30, 50]], // collapse after stripping
  [[30, 50], [31, 51], [31, 50], [30, 51], [30, 50], [30, 50]], // bow tie
  [[30, 50], [31, 50], [31 + 1e-12, 50], [31, 51], [30, 51], [30, 50]],
  [[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10], [179, 10.000000000001]],
  [[180, 10], [-180, 10], [-179, 11], [179, 11], [180, 10]], // meridian alias is not exact
]) {
  const normalized = normalize(ring);
  assert.equal(normalized.removedVertices, 0,
    'near-duplicates, collapsed rings and other invalid topology must not be repaired');
  assert.throws(() => requireUsableReferenceGeometry(normalized.payload, 'test'),
    /malformed polygon rings/);
}

const multi = {type: 'FeatureCollection', features: [
  {type: 'Feature', properties: {name: 'Россия'}, geometry: {
    type: 'GeometryCollection', geometries: [
      {type: 'Point', coordinates: [37, 55]},
      {type: 'MultiPolygon', coordinates: [[withDuplicate], [square]]},
    ],
  }},
]};
const nested = normalizeExactDuplicatePolygonFeatures(multi);
assert.equal(nested.removedVertices, 1);
assert.equal(requireUsableReferenceGeometry(nested.payload, 'test').hasPolygon, true);
assert.equal(nested.payload.features[0].geometry.geometries[0],
  multi.features[0].geometry.geometries[0], 'point metadata must be retained');

const holeOutside = {type: 'FeatureCollection', features: [{type: 'Feature',
  geometry: {type: 'Polygon', coordinates: [withDuplicate,
    [[[40, 60], [41, 60], [41, 61], [40, 61], [40, 60]]][0]]}, properties: {}}]};
const failedHole = normalizeExactDuplicatePolygonFeatures(holeOutside);
assert.equal(failedHole.removedVertices, 0,
  'an invalid hole must not be excused by an exact duplicate in the shell');
assert.throws(() => requireUsableReferenceGeometry(failedHole.payload, 'test'),
  /malformed polygon rings/);


// Hole-topology failures must remain fatal but reveal the specific scalar
// cause. These synthetic rings contain no licensed source geometry.
const shell = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const hole = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d], [a, b]];
const concaveShell = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3],
  [3, 3], [3, 10], [0, 10], [0, 0]];
const holeCases = [
  [[shell, hole(20, 20, 21, 21)], 'hole-outside-shell'],
  // A partially escaping hole crosses the actual shell edge. The previous
  // vertex-first diagnostic incorrectly counted it as "outside shell".
  [[shell, hole(9, 4, 12, 6)], 'hole-crosses-shell'],
  [[shell, hole(10, 4, 12, 6)], 'hole-crosses-shell'],
  [[concaveShell, hole(1, 5, 9, 6)], 'hole-crosses-shell'],
  [[shell, hole(2, 2, 7, 7), hole(3, 3, 4, 4)], 'holes-nested'],
  [[shell, hole(2, 2, 6, 6), hole(5, 5, 8, 8)], 'holes-cross-or-touch'],
];
for (const [polygon, expected] of holeCases) {
  assert.equal(hasValidPolygonTopology(polygon), false);
  assert.equal(polygonHoleTopologyFailureReason(polygon), expected);
  const summary = summarizePolygonFailures({type: 'Polygon', coordinates: polygon});
  assert.equal(summary.invalidHoleTopology, 1);
  assert.equal(summary.invalidHoleReasons[expected], 1);
  assert.equal(summary.validPolygons, 0);
}
assert.equal(polygonHoleTopologyFailureReason([shell, hole(2, 2, 4, 4)]), null);
assert.equal(hasValidPolygonTopology([shell, hole(2, 2, 4, 4)]), true);


 // A -> B -> A is an exact retraced zero-area spur, not a sovereign
 // extension. Only the two cancelling segments may be removed, and the
 // remaining shell/hole must still pass the unchanged strict validator.
const retraced = [[30, 50], [31, 50], [31, 51], [31.2, 51.2],
  [31, 51], [30, 51], [30, 50]];
assert.equal(hasValidPolygonTopology([retraced]), false);
const retracedResult = normalize(retraced);
assert.equal(retracedResult.removedVertices, 2);
assert.deepEqual(retracedResult.payload.features[0].geometry.coordinates[0], square);
assert.equal(requireUsableReferenceGeometry(retracedResult.payload, 'synthetic-spur').hasPolygon, true);
assert.deepEqual(retraced[3], [31.2, 51.2], 'source spur must not be mutated');

const repeatedSpurs = [[30, 50], [31, 50], [31, 51], [31.2, 51.2],
  [31, 51], [31.1, 51.1], [31, 51], [30, 51], [30, 50]];
const repeatedResult = normalize(repeatedSpurs);
assert.equal(repeatedResult.removedVertices, 4);
assert.deepEqual(repeatedResult.payload.features[0].geometry.coordinates[0], square);

const holedSpur = {type: 'Polygon', coordinates: [square, [
  [30.2, 50.2], [30.8, 50.2], [30.8, 50.8], [30.9, 50.9],
  [30.8, 50.8], [30.2, 50.8], [30.2, 50.2],
]]};
const normalizedHole = normalizeExactDuplicatePolygonFeatures(holedSpur);
assert.equal(normalizedHole.removedVertices, 2);
assert.equal(hasValidPolygonTopology(normalizedHole.payload.coordinates), true);
assert.equal(requireUsableReferenceGeometry(normalizedHole.payload, 'synthetic-hole').hasPolygon, true);

// A nearly retraced spur is not exact; it can enclose a real thin area.
// Ambiguous half-world edges and altitude-bearing source vertices are also
// never silently erased, even when a resulting square would look valid.
for (const unsafe of [
  [[30, 50], [31, 50], [31, 51], [31.2, 51.2],
    [31, 51.0000001], [30, 51], [30, 50]],
  [[30, 50], [31, 50], [31, 51], [-149, 51],
    [31, 51], [30, 51], [30, 50]],
  [[30, 50, 1], [31, 50, 1], [31, 51, 1], [31.2, 51.2, 1],
    [31, 51, 1], [30, 51, 1], [30, 50, 1]],
]) {
  const untouched = normalize(unsafe);
  assert.equal(untouched.removedVertices, 0,
    'non-exact, ambiguous and 3D spurs must not be normalized');
  assert.deepEqual(untouched.payload.features[0].geometry.coordinates[0], unsafe);
}
// Removing an exact spur must not excuse a separate invalid hole.
const invalidWithSpur = normalizeExactDuplicatePolygonFeatures({
  type: 'Polygon', coordinates: [retraced,
    [[40, 60], [41, 60], [41, 61], [40, 61], [40, 60]]],
});
assert.equal(invalidWithSpur.removedVertices, 0);
assert.throws(() => requireUsableReferenceGeometry(invalidWithSpur.payload, 'synthetic-invalid-hole'),
  /malformed polygon rings/);

console.log('Runivers lossless reference normalization passed: exact duplicate edges and exact retraced spurs only, strict topology preserved.');
