import * as THREE from 'three';

// V21 renders polygon outlines as independent line segments. GeoJSON interior
// rings (lakes / holes) therefore used to become political borders as well.
// Adjacent polygons can also describe the same political border with slightly
// different vertices, which produces visible double lines at close zoom.
// This compatibility layer fixes both problems before polygon-derived political
// borders are attached to the scene. Rivers and verified LineString boundaries
// are deliberately left untouched.

const PATCH_KEY = Symbol.for('rulers-of-russia.cartographic-boundary-sanitizer.v2');
const TARGET_KINDS = new Set([
  'world-border',
  'russia-border',
  'russia-uncertainty',
]);
const POINT_EPSILON = 2e-7;
const AREA_EPSILON = 1e-10;
const WORLD_NEAR_DUPLICATE_THRESHOLD_DEG = 0.01;
const WORLD_DUPLICATE_GRID_DEG = 0.05;
const REVERSE_PARALLEL_DOT = -0.995;

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

function exteriorSegments(startAttribute, endAttribute) {
  const segments = [];
  const chains = splitIntoSourceChains(startAttribute, endAttribute);
  for (let chainIndex = 0; chainIndex < chains.length; chainIndex += 1) {
    const chain = chains[chainIndex];
    if (isInteriorRing(chain)) continue;
    for (const segment of chain) segments.push({...segment, chainIndex});
  }
  return segments;
}

function flattenPositions(segments) {
  const positions = [];
  for (const segment of segments) positions.push(...segment.start, ...segment.end);
  return positions;
}

export function sanitizePolygonBoundaryPositions(startAttribute, endAttribute) {
  if (!startAttribute || !endAttribute || startAttribute.count !== endAttribute.count) return null;
  return flattenPositions(exteriorSegments(startAttribute, endAttribute));
}

function normalizeSegmentLonLat(segment) {
  const start = toLonLat(segment.start);
  const end = toLonLat(segment.end);
  let x1 = start[0];
  const y1 = start[1];
  let x2 = end[0];
  const y2 = end[1];

  if (x2 - x1 > 180) x2 -= 360;
  else if (x2 - x1 < -180) x2 += 360;

  let middle = (x1 + x2) / 2;
  while (middle > 180) {
    x1 -= 360;
    x2 -= 360;
    middle -= 360;
  }
  while (middle < -180) {
    x1 += 360;
    x2 += 360;
    middle += 360;
  }

  const midLat = (y1 + y2) / 2;
  const cos = Math.max(0.2, Math.cos(midLat * Math.PI / 180));
  const dx = (x2 - x1) * cos;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const safeLength = length || 1;

  return {
    ...segment,
    coords: [x1, y1, x2, y2],
    minX: Math.min(x1, x2),
    maxX: Math.max(x1, x2),
    minY: Math.min(y1, y2),
    maxY: Math.max(y1, y2),
    length,
    dirX: dx / safeLength,
    dirY: dy / safeLength,
  };
}

function pointSegmentDistance(lon, lat, segment) {
  let [x1, y1, x2, y2] = segment.coords;
  while (lon - x1 > 180) lon -= 360;
  while (lon - x1 < -180) lon += 360;
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const dx = (x2 - x1) * cos;
  const dy = y2 - y1;
  const px = (lon - x1) * cos;
  const py = lat - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
  return Math.hypot(px - t * dx, py - t * dy);
}

function isReverseParallel(a, b) {
  return a.dirX * b.dirX + a.dirY * b.dirY <= REVERSE_PARALLEL_DOT;
}

function candidateLiesOnKept(candidate, kept, threshold) {
  if (!isReverseParallel(candidate, kept)) return false;
  const [x1, y1, x2, y2] = candidate.coords;
  return pointSegmentDistance(x1, y1, kept) <= threshold
    && pointSegmentDistance(x2, y2, kept) <= threshold;
}

function gridKey(x, y) {
  return `${x},${y}`;
}

function addToGrid(grid, segment, index, cell, pad) {
  const minX = Math.floor((segment.minX - pad) / cell);
  const maxX = Math.floor((segment.maxX + pad) / cell);
  const minY = Math.floor((segment.minY - pad) / cell);
  const maxY = Math.floor((segment.maxY + pad) / cell);
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      const key = gridKey(gx, gy);
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push(index);
    }
  }
}

function nearbyIndexes(grid, segment, cell, pad) {
  const indexes = new Set();
  const minX = Math.floor((segment.minX - pad) / cell);
  const maxX = Math.floor((segment.maxX + pad) / cell);
  const minY = Math.floor((segment.minY - pad) / cell);
  const maxY = Math.floor((segment.maxY + pad) / cell);
  for (let gx = minX; gx <= maxX; gx += 1) {
    for (let gy = minY; gy <= maxY; gy += 1) {
      for (const index of grid.get(gridKey(gx, gy)) ?? []) indexes.add(index);
    }
  }
  return indexes;
}

function canonicalizeNearDuplicateWorldBorders(segments) {
  const prepared = segments
    .map(normalizeSegmentLonLat)
    .filter((segment) => Number.isFinite(segment.length) && segment.length > 1e-10)
    .sort((a, b) => b.length - a.length);

  const kept = [];
  const grid = new Map();
  let removed = 0;

  for (const candidate of prepared) {
    let duplicate = false;
    for (const index of nearbyIndexes(
      grid,
      candidate,
      WORLD_DUPLICATE_GRID_DEG,
      WORLD_NEAR_DUPLICATE_THRESHOLD_DEG,
    )) {
      const existing = kept[index];
      if (!existing || existing.chainIndex === candidate.chainIndex) continue;
      if (candidateLiesOnKept(candidate, existing, WORLD_NEAR_DUPLICATE_THRESHOLD_DEG)) {
        duplicate = true;
        break;
      }
    }

    if (duplicate) {
      removed += 1;
      continue;
    }

    const index = kept.length;
    kept.push(candidate);
    addToGrid(
      grid,
      candidate,
      index,
      WORLD_DUPLICATE_GRID_DEG,
      WORLD_NEAR_DUPLICATE_THRESHOLD_DEG,
    );
  }

  return {segments: kept, removed};
}

function sanitizeBoundaryObject(object) {
  if (!TARGET_KINDS.has(object?.userData?.kind)) return;
  const geometry = object.geometry;
  const start = geometry?.attributes?.instanceStart;
  const end = geometry?.attributes?.instanceEnd;
  if (!start || !end || start.count !== end.count) return;

  const sourceCount = start.count;
  let segments = exteriorSegments(start, end);
  const removedInterior = sourceCount - segments.length;
  let removedNearDuplicate = 0;

  if (object.userData.kind === 'world-border' && segments.length > 1) {
    const canonical = canonicalizeNearDuplicateWorldBorders(segments);
    segments = canonical.segments;
    removedNearDuplicate = canonical.removed;
  }

  if (!removedInterior && !removedNearDuplicate) return;

  geometry.setPositions(flattenPositions(segments));
  object.computeLineDistances?.();
  object.userData.removedInteriorBorderSegments = removedInterior;
  object.userData.removedNearDuplicateBorderSegments = removedNearDuplicate;
  object.userData.canonicalPoliticalBorderSegments = segments.length;
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
