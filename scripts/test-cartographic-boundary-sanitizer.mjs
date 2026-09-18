import assert from 'node:assert/strict';
import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import '../src/app/territory/cartographicBoundarySanitizer.js';

function latLonVector(lat, lon, radius = 1.00012) {
  const phi = lat * Math.PI / 180;
  const lambda = lon * Math.PI / 180;
  return [
    Math.cos(phi) * Math.cos(lambda) * radius,
    Math.sin(phi) * radius,
    -Math.cos(phi) * Math.sin(lambda) * radius,
  ];
}

function segment(aLon, aLat, bLon, bLat) {
  return [...latLonVector(aLat, aLon), ...latLonVector(bLat, bLon)];
}

function makeBoundary(kind, segments) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(segments.flat());
  const line = new LineSegments2(geometry);
  line.userData.kind = kind;
  return line;
}

{
  const group = new THREE.Group();
  const border = makeBoundary('world-border', [
    segment(0, 0, 1, 0),
    segment(1, 0.005, 0, 0.005),
    segment(0, 0.008, 1, 0.008),
  ]);
  group.add(border);
  assert.equal(border.geometry.attributes.instanceStart.count, 2, 'reverse near-duplicate world border should collapse once');
  assert.equal(border.userData.removedNearDuplicateBorderSegments, 1, 'one near-duplicate segment should be recorded as removed');
}

{
  const group = new THREE.Group();
  const border = makeBoundary('world-border', [
    segment(0, 0, 1, 0),
    segment(1, 0.02, 0, 0.02),
  ]);
  group.add(border);
  assert.equal(border.geometry.attributes.instanceStart.count, 2, 'separate reverse border outside tolerance must remain');
}

{
  const group = new THREE.Group();
  const border = makeBoundary('russia-border', [
    segment(0, 0, 1, 0),
    segment(1, 0.005, 0, 0.005),
  ]);
  group.add(border);
  assert.equal(border.geometry.attributes.instanceStart.count, 2, 'Russia legal-border geometry must not be proximity-deduplicated');
}

console.log('Cartographic boundary sanitizer tests passed.');
