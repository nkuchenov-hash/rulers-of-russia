// Diagnostic-only validation of independent WGS84 polygon rings. Never repairs or exports geometry.
const EPS = 1e-10;
const equal = (a, b) => Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS;
// The topology helper is also called independently of the transport preflight.
// Malformed or empty rings must return false rather than throw or certify an
// empty polygon. Coordinates are WGS84 degrees; optional altitude is ignored.
const validPosition = p => Array.isArray(p) && p.length >= 2
  && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
// GeoJSON linear rings require identical first/last longitude and latitude.
// A nearly closed ring (or a +/-180 alias) must not pass merely because
// the unwrapped endpoints fall within the topology intersection epsilon.
const validRingShape = ring => Array.isArray(ring) && ring.length >= 4
  && ring.every(validPosition)
  && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
function hasArea(ring) {
  let twiceArea = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  // Match the independent hotspot diagnostic's degenerate-area guard.
  return Number.isFinite(twiceArea) && Math.abs(twiceArea) > 1e-12;
}

function unwrap(ring) {
  const points = [];
  for (const [rawLon, lat] of ring) {
    let lon = rawLon;
    if (points.length) {
      const previous = points.at(-1)[0];
      while (lon - previous > 180) lon -= 360;
      while (lon - previous < -180) lon += 360;
    }
    points.push([lon, lat]);
  }
  return points;
}

function segments(ring) {
  return ring.slice(0, -1).map((a, i) => {
    const b = ring[i + 1];
    return {a, b, i, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]),
      minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1])};
  });
}
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const between = (v, a, b) => v >= Math.min(a, b) - EPS && v <= Math.max(a, b) + EPS;
const onSegment = (a, b, c) => Math.abs(orient(a, b, c)) <= EPS
  && between(c[0], a[0], b[0]) && between(c[1], a[1], b[1]);
function intersects(s, t) {
  if (s.maxX < t.minX - EPS || t.maxX < s.minX - EPS
    || s.maxY < t.minY - EPS || t.maxY < s.minY - EPS) return false;
  const o1 = orient(s.a, s.b, t.a), o2 = orient(s.a, s.b, t.b);
  const o3 = orient(t.a, t.b, s.a), o4 = orient(t.a, t.b, s.b);
  return (o1 > EPS && o2 < -EPS || o1 < -EPS && o2 > EPS)
    && (o3 > EPS && o4 < -EPS || o3 < -EPS && o4 > EPS)
    || onSegment(s.a, s.b, t.a) || onSegment(s.a, s.b, t.b)
    || onSegment(t.a, t.b, s.a) || onSegment(t.a, t.b, s.b);
}

// Sweep along longitude: only edges with overlapping X-ranges can intersect.
function crossingEdges(first, second, sameRing = false) {
  const left = segments(first).sort((a, b) => a.minX - b.minX);
  const right = sameRing ? left : segments(second).sort((a, b) => a.minX - b.minX);
  const active = [];
  let cursor = 0;
  for (const edge of left) {
    while (cursor < right.length && right[cursor].minX <= edge.maxX + EPS) active.push(right[cursor++]);
    for (let j = active.length - 1; j >= 0; j--) {
      const candidate = active[j];
      if (candidate.maxX < edge.minX - EPS) { active.splice(j, 1); continue; }
      if (sameRing) {
        if (candidate.i === edge.i) continue;
        const n = left.length;
        if (Math.abs(candidate.i - edge.i) === 1 || Math.abs(candidate.i - edge.i) === n - 1) continue;
      }
      if (intersects(edge, candidate)) return true;
    }
  }
  return false;
}
// Adjacent edges normally share a vertex, but reversing along the same
// segment creates a retraced boundary (a zero-width spike). The sweep skips
// adjacent edges by design, so reject these separately, including at closure.
function hasBacktrackingEdge(ring) {
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    const prev = ring[(i + n - 1) % n], middle = ring[i], next = ring[i + 1];
    if (Math.abs(orient(prev, middle, next)) > EPS) continue;
    const inX = middle[0] - prev[0], inY = middle[1] - prev[1];
    const outX = next[0] - middle[0], outY = next[1] - middle[1];
    if (inX * outX + inY * outY < -EPS) return true;
  }
  return false;
}
function strictlyInside(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length - 1; j = i++) {
    const a = ring[j], b = ring[i];
    if (onSegment(a, b, point)) return false;
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function hasZeroLengthEdge(ring) {
  // Adjacent duplicate vertices are not a boundary segment. This also catches
  // +180/-180 aliases after unwrapping, which can otherwise pass the sweep:
  // adjacent edges are deliberately exempted from self-intersection checks.
  for (let i = 0; i < ring.length - 1; i++) {
    if (equal(ring[i], ring[i + 1])) return true;
  }
  return false;
}
function validUnwrappedRing(ring) {
  // A full wrap can masquerade as a closed polygon in [-180,180].
  return equal(ring[0], ring.at(-1)) && hasArea(ring)
    && !hasZeroLengthEdge(ring) && !hasBacktrackingEdge(ring)
    && !crossingEdges(ring, ring, true);
}
export function hasValidRingTopology(rawRing) {
  return validRingShape(rawRing) && validUnwrappedRing(unwrap(rawRing));
}
export function hasValidPolygonTopology(rawPolygon) {
  if (!Array.isArray(rawPolygon) || !rawPolygon.length
    || !rawPolygon.every(validRingShape)) return false;
  const rings = rawPolygon.map(unwrap);
  if (rings.some(ring => !validUnwrappedRing(ring))) return false;
  const shell = rings[0];
  const holes = rings.slice(1).map(hole => {
    const shift = 360 * Math.round((shell[0][0] - hole[0][0]) / 360);
    return hole.map(([lon, lat]) => [lon + shift, lat]);
  });
  for (const hole of holes) {
    if (hole.slice(0, -1).some(vertex => !strictlyInside(vertex, shell))) return false;
    if (crossingEdges(shell, hole)) return false;
  }
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    if (crossingEdges(holes[i], holes[j])
      || strictlyInside(holes[i][0], holes[j]) || strictlyInside(holes[j][0], holes[i])) return false;
  }
  return true;
}
