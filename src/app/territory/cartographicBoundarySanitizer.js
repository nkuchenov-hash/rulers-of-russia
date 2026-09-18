import * as THREE from 'three';

// V21 renders polygon outlines as independent line segments. GeoJSON interior
// rings (lakes / holes) therefore used to become political borders as well.
// This compatibility layer removes closed interior rings before a boundary
// LineSegments2 object is attached to the scene. It deliberately touches only
// polygon-derived political border kinds; rivers and verified LineString
// boundaries are left intact.

const PATCH_KEY = Symbol.for('rulers-of-russia.cartographic-boundary-sanitizer.v1');
const TARGET_KINDS = new Set([
  'world-border',
  'russia-border',
  'russia-uncertainty',
]);
const POINT_EPSILON = 2e-7;
const AREA_EPSILON = 1e-10;

function pointFromAttribute(attribute, index) {
  return [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) <= POINT_EPSILON
    && Math.abs(a[1] - b[1]) <= POINT_EPSILON
    && Math.abs(a[2] - b[2]) <= POINT_EPSILON;
}

function toLonLat(point) {
  const [x, y, z] = point;
  const radius = Math.hypot(x, y, z) || 1;
  return [
    Math.atan2(-z, x) * 180 / Math.PI,
    Math.asin(Math.max(-1, Math.min(1, y / radius))) * 180 / Math.PI,
  ];
}

function unwrapLongitudes(points) {
  if (!points.length) return points;
  const out = [points[0].slice()];
  for (let index = 1; index < points.length; index += 1) {
    let [lon, lat] = points[index];
    const previous = out[index - 1][0];
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    out.push([lon, lat]);
  }
  return out;
}

function signedAreaOnLonLat(chain) {
  const vertices = [chain[0].start, ...chain.map((segment) => segment.end)];
  const points = unwrapLongitudes(vertices.map(toLonLat));
  let twiceArea = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea / 2;
}

function splitIntoSourceChains(startAttribute, endAttribute) {
  const chains = [];
  let current = [];

  for (let index = 0; index < startAttribute.count; index += 1) {
    const segment = {
      start: pointFromAttribute(startAttribute, index),
      end: pointFromAttribute(endAttribute, index),
    };

    if (current.length && !samePoint(current[current.length - 1].end, segment.start)) {
      chains.push(current);
      current = [];
    }
    current.push(segment);
  }

  if (current.length) chains.push(current);
  return chains;
}

function isClosed(chain) {
  return chain.length >= 3 && samePoint(chain[0].start, chain[chain.length - 1].end);
}

function isInteriorRing(chain) {
  if (!isClosed(chain)) return false;
  const area = signedAreaOnLonLat(chain);
  if (Math.abs(area) <= AREA_EPSILON) return false;

  // normalizeFeature() in V21 normalizes d3-spherical polygons so their
  // exterior ring is clockwise. In ordinary lon/lat signed-area terms that
  // means exterior rings are negative and interior rings are positive.
  return area > 0;
}

export function sanitizePolygonBoundaryPositions(startAttribute, endAttribute) {
  if (!startAttribute || !endAttribute || startAttribute.count !== endAttribute.count) return null;

  const positions = [];
  const chains = splitIntoSourceChains(startAttribute, endAttribute);
  for (const chain of chains) {
    if (isInteriorRing(chain)) continue;
    for (const segment of chain) {
      positions.push(...segment.start, ...segment.end);
    }
  }
  return positions;
}

function sanitizeBoundaryObject(object) {
  if (!TARGET_KINDS.has(object?.userData?.kind)) return;
  const geometry = object.geometry;
  const start = geometry?.attributes?.instanceStart;
  const end = geometry?.attributes?.instanceEnd;
  if (!start || !end) return;

  const positions = sanitizePolygonBoundaryPositions(start, end);
  if (!positions || positions.length === start.count * 6) return;

  geometry.setPositions(positions);
  object.computeLineDistances?.();
  object.userData.removedInteriorBorderSegments = start.count - positions.length / 6;
}

if (!THREE.Group.prototype[PATCH_KEY]) {
  const originalAdd = THREE.Group.prototype.add;
  Object.defineProperty(THREE.Group.prototype, PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  THREE.Group.prototype.add = function patchedAdd(...objects) {
    for (const object of objects) sanitizeBoundaryObject(object);
    return originalAdd.apply(this, objects);
  };
}
