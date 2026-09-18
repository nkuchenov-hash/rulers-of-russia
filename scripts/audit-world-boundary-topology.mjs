import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'world-history');
const THRESHOLDS = [0.005, 0.01, 0.02, 0.05];
const GRID = 0.1;
const PARALLEL_COS = 0.995;
const EPS = 1e-12;

function exteriorRings(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return geometry.coordinates?.[0] ? [geometry.coordinates[0]] : [];
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).flatMap((polygon) => polygon?.[0] ? [polygon[0]] : []);
  }
  return [];
}

function holeCount(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return Math.max(0, (geometry.coordinates?.length ?? 0) - 1);
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates ?? []).reduce((sum, polygon) => sum + Math.max(0, (polygon?.length ?? 0) - 1), 0);
  }
  return 0;
}

function normalizeLonPair(a, b) {
  let x1 = Number(a[0]);
  let x2 = Number(b[0]);
  if (x2 - x1 > 180) x2 -= 360;
  else if (x2 - x1 < -180) x2 += 360;
  return [x1, Number(a[1]), x2, Number(b[1])];
}

function pointKey(point) {
  return `${Math.round(Number(point[0]) * 1e5)},${Math.round(Number(point[1]) * 1e5)}`;
}

function exactKey(a, b) {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

function gridKey(x, y) {
  return `${x},${y}`;
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
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPS) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  return Math.hypot(px - t * dx, py - t * dy);
}

function segmentLength(segment) {
  const [x1, y1, x2, y2] = segment.coords;
  const lat = (y1 + y2) / 2;
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  return Math.hypot((x2 - x1) * cos, y2 - y1);
}

function direction(segment) {
  const [x1, y1, x2, y2] = segment.coords;
  const lat = (y1 + y2) / 2;
  const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
  const dx = (x2 - x1) * cos;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [dx / len, dy / len];
}

function isParallel(a, b) {
  const da = direction(a);
  const db = direction(b);
  return Math.abs(da[0] * db[0] + da[1] * db[1]) >= PARALLEL_COS;
}

function nearDistance(a, b) {
  const shorter = segmentLength(a) <= segmentLength(b) ? a : b;
  const longer = shorter === a ? b : a;
  const [x1, y1, x2, y2] = shorter.coords;
  return Math.max(
    pointSegmentDistance(x1, y1, longer),
    pointSegmentDistance(x2, y2, longer),
  );
}

function collectSegments(collection) {
  const segments = [];
  let holes = 0;
  for (let featureIndex = 0; featureIndex < (collection?.features ?? []).length; featureIndex += 1) {
    const feature = collection.features[featureIndex];
    holes += holeCount(feature);
    for (const ring of exteriorRings(feature)) {
      if (!Array.isArray(ring) || ring.length < 2) continue;
      for (let index = 0; index < ring.length - 1; index += 1) {
        const a = ring[index];
        const b = ring[index + 1];
        if (!a || !b) continue;
        const coords = normalizeLonPair(a, b);
        if (!coords.every(Number.isFinite)) continue;
        const [x1, y1, x2, y2] = coords;
        if (Math.hypot(x2 - x1, y2 - y1) <= EPS) continue;
        segments.push({
          featureIndex,
          coords,
          exactKey: exactKey(a, b),
          minX: Math.min(x1, x2),
          maxX: Math.max(x1, x2),
          minY: Math.min(y1, y2),
          maxY: Math.max(y1, y2),
        });
      }
    }
  }
  return { segments, holes };
}

function exactSharedStats(segments) {
  const ownersByKey = new Map();
  for (const segment of segments) {
    let owners = ownersByKey.get(segment.exactKey);
    if (!owners) {
      owners = new Set();
      ownersByKey.set(segment.exactKey, owners);
    }
    owners.add(segment.featureIndex);
  }
  let sharedKeys = 0;
  let sharedSegmentInstances = 0;
  for (const owners of ownersByKey.values()) {
    if (owners.size > 1) {
      sharedKeys += 1;
      sharedSegmentInstances += owners.size;
    }
  }
  return { sharedKeys, sharedSegmentInstances };
}

function buildGrid(segments, pad = THRESHOLDS.at(-1)) {
  const grid = new Map();
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const minGX = Math.floor((segment.minX - pad) / GRID);
    const maxGX = Math.floor((segment.maxX + pad) / GRID);
    const minGY = Math.floor((segment.minY - pad) / GRID);
    const maxGY = Math.floor((segment.maxY + pad) / GRID);
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      for (let gy = minGY; gy <= maxGY; gy += 1) {
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
  return grid;
}

function nearDuplicateStats(segments) {
  const counts = Object.fromEntries(THRESHOLDS.map((threshold) => [threshold, 0]));
  const grid = buildGrid(segments);
  const seenPairs = new Set();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const minGX = Math.floor((segment.minX - THRESHOLDS.at(-1)) / GRID);
    const maxGX = Math.floor((segment.maxX + THRESHOLDS.at(-1)) / GRID);
    const minGY = Math.floor((segment.minY - THRESHOLDS.at(-1)) / GRID);
    const maxGY = Math.floor((segment.maxY + THRESHOLDS.at(-1)) / GRID);
    const candidates = new Set();
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      for (let gy = minGY; gy <= maxGY; gy += 1) {
        for (const candidate of grid.get(gridKey(gx, gy)) ?? []) {
          if (candidate > index) candidates.add(candidate);
        }
      }
    }

    for (const candidateIndex of candidates) {
      const other = segments[candidateIndex];
      if (segment.featureIndex === other.featureIndex) continue;
      if (segment.exactKey === other.exactKey) continue;
      const pairKey = `${index}:${candidateIndex}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      if (!isParallel(segment, other)) continue;
      const distance = nearDistance(segment, other);
      for (const threshold of THRESHOLDS) {
        if (distance <= threshold) counts[threshold] += 1;
      }
    }
  }

  return counts;
}

function pct(value, total) {
  return total ? `${(100 * value / total).toFixed(1)}%` : '0.0%';
}

async function main() {
  const index = JSON.parse(await readFile(path.join(ROOT, 'index.json'), 'utf8'));
  const rows = [];

  for (const snapshot of index.snapshots ?? []) {
    const collection = JSON.parse(await readFile(path.join(ROOT, snapshot.file), 'utf8'));
    const { segments, holes } = collectSegments(collection);
    const exact = exactSharedStats(segments);
    const near = nearDuplicateStats(segments);
    rows.push({
      year: snapshot.year,
      features: collection.features?.length ?? 0,
      holes,
      segments: segments.length,
      exactSharedKeys: exact.sharedKeys,
      exactSharedInstances: exact.sharedSegmentInstances,
      exactSharedInstanceRate: pct(exact.sharedSegmentInstances, segments.length),
      near005: near[0.005],
      near010: near[0.01],
      near020: near[0.02],
      near050: near[0.05],
    });
  }

  console.table(rows);

  const totals = rows.reduce((acc, row) => {
    for (const key of ['holes', 'segments', 'exactSharedKeys', 'exactSharedInstances', 'near005', 'near010', 'near020', 'near050']) {
      acc[key] = (acc[key] ?? 0) + row[key];
    }
    return acc;
  }, {});
  totals.exactSharedInstanceRate = pct(totals.exactSharedInstances, totals.segments);
  console.log('WORLD_BOUNDARY_TOPOLOGY_AUDIT', JSON.stringify(totals));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
