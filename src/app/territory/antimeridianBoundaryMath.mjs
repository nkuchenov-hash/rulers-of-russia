// Render-only proximity math for historical globe border suppression.
// Does not modify, infer, or certify historical polygons.
export function boundaryMidpointLongitude(lonA, lonB) {
  if (!Number.isFinite(lonA) || !Number.isFinite(lonB)) return NaN;
  let b = lonB;
  if (b - lonA > 180) b -= 360;
  else if (b - lonA < -180) b += 360;
  const midpoint = (lonA + b) / 2;
  return ((midpoint + 180) % 360 + 360) % 360 - 180;
}

function polygonRings(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'Polygon') return geometry.coordinates ?? [];
  if (geometry?.type === 'MultiPolygon') return (geometry.coordinates ?? []).flat();
  return [];
}

export function boundaryGrid(features, cell = .5) {
  const map = new Map(), segments = [];
  const put = (x, y, index) => {
    const key = `${x},${y}`;
    let list = map.get(key);
    if (!list) { list = []; map.set(key, list); }
    list.push(index);
  };
  for (const feature of features ?? []) for (const ring of polygonRings(feature)) {
    if (!Array.isArray(ring) || ring.length < 2) continue;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      if (!a || !b) continue;
      let x1 = Number(a[0]), x2 = Number(b[0]);
      const y1 = Number(a[1]), y2 = Number(b[1]);
      if (![x1, x2, y1, y2].every(Number.isFinite)) continue;
      if (x2 - x1 > 180) x2 -= 360;
      else if (x2 - x1 < -180) x2 += 360;
      const index = segments.length;
      segments.push([x1, y1, x2, y2]);
      const minX = Math.floor((Math.min(x1, x2) - .42) / cell);
      const maxX = Math.floor((Math.max(x1, x2) + .42) / cell);
      const minY = Math.floor((Math.min(y1, y2) - .42) / cell);
      const maxY = Math.floor((Math.max(y1, y2) + .42) / cell);
      for (let gx = minX; gx <= maxX; gx++) for (let gy = minY; gy <= maxY; gy++) put(gx, gy, index);
    }
  }
  return {map, segments, cell};
}

function pointSegmentDistance(lon, lat, segment) {
  const [x1, y1, x2, y2] = segment;
  while (lon - x1 > 180) lon -= 360;
  while (lon - x1 < -180) lon += 360;
  const cos = Math.max(.2, Math.cos(lat * Math.PI / 180));
  const dx = (x2 - x1) * cos, dy = y2 - y1;
  const px = (lon - x1) * cos, py = lat - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-12) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSquared));
  return Math.hypot(px - t * dx, py - t * dy);
}

export function nearBoundary(lon, lat, grid, threshold = .32) {
  if (!grid || !Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const gy = Math.floor(lat / grid.cell), seen = new Set();
  // The same antimeridian edge can be indexed at +180 or -180. Query
  // periodic copies, but calculate distance to each original segment once.
  for (const copy of [lon, lon - 360, lon + 360]) {
    const gx = Math.floor(copy / grid.cell);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      for (const index of grid.map.get(`${gx + ox},${gy + oy}`) ?? []) {
        if (seen.has(index)) continue;
        seen.add(index);
        if (pointSegmentDistance(lon, lat, grid.segments[index]) <= threshold) return true;
      }
    }
  }
  return false;
}
