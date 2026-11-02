import {hasValidPolygonTopology} from './runivers-ring-topology.mjs';
import {hasValidWgs84Line} from './runivers-line-topology.mjs';

// Exact consecutive duplicate coordinates trace a zero-length edge. Removing
// only those edges leaves every nonzero boundary segment unchanged. This is
// an ephemeral reference-transport normalization, NOT a tolerance adjustment,
// a polygon repair, or permission to distribute third-party geometry.
function stripExactAdjacentDuplicates(ring) {
  if (!Array.isArray(ring)) return {ring, removed: 0};
  const cleaned = [];
  let removed = 0;
  for (const point of ring) {
    const previous = cleaned.at(-1);
    if (Array.isArray(point) && Array.isArray(previous)
      && point.length >= 2 && previous.length >= 2
      && point[0] === previous[0] && point[1] === previous[1]) {
      // An altitude change does not change the 2D political boundary, but
      // never discard it silently: only exact full coordinate tuples qualify.
      if (point.length === previous.length
        && point.every((value, index) => value === previous[index])) {
        removed++;
        continue;
      }
    }
    cleaned.push(point);
  }
  return {ring: cleaned, removed};
}

// A source polygon may trace A -> B -> A as an exact out-and-back
// zero-area spur. Both directed edges cancel: removing B and the returning
// A changes no enclosed area and leaves all other edges untouched.
// This is temporary reference-transport normalization only. Do not infer
// a near-match, remove an ambiguous 180-degree/polar edge, or modify 3D
// coordinates. The entire resulting polygon must still pass strict topology.
function stripExactRetracedSpikes(ring) {
  if (!Array.isArray(ring)) return {ring, removed: 0};
  const cleaned = [];
  let removed = 0;
  for (const point of ring) {
    cleaned.push(point);
    while (cleaned.length >= 3) {
      const a = cleaned[cleaned.length - 3];
      const b = cleaned[cleaned.length - 2];
      const c = cleaned[cleaned.length - 1];
      if (![a, b, c].every(p => Array.isArray(p) && p.length === 2)
        || a[0] !== c[0] || a[1] !== c[1]
        || !hasValidWgs84Line([a, b])) break;
      cleaned.pop(); // returning A
      cleaned.pop(); // spur tip B
      removed += 2;
    }
  }
  return {ring: cleaned, removed};
}

function normalizePolygon(polygon) {
  if (!Array.isArray(polygon)) return {polygon, removed: 0};
  const candidates = polygon.map(ring => {
    const duplicates = stripExactAdjacentDuplicates(ring);
    const spikes = stripExactRetracedSpikes(duplicates.ring);
    return {ring: spikes.ring, removed: duplicates.removed + spikes.removed};
  });
  const removed = candidates.reduce((total, item) => total + item.removed, 0);
  if (!removed) return {polygon, removed: 0};
  const cleaned = candidates.map(item => item.ring);
  // A collapsed shell, self-intersection, malformed hole or any other
  // topological failure must still fail closed under the unchanged validator.
  if (!hasValidPolygonTopology(cleaned)) return {polygon, removed: 0};
  return {polygon: cleaned, removed};
}

export function normalizeExactDuplicatePolygonGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') return {geometry, removedVertices: 0};
  if (geometry.type === 'Polygon') {
    const result = normalizePolygon(geometry.coordinates);
    return {geometry: result.removed ? {...geometry, coordinates: result.polygon} : geometry,
      removedVertices: result.removed};
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const results = geometry.coordinates.map(normalizePolygon);
    const removedVertices = results.reduce((total, item) => total + item.removed, 0);
    return {geometry: removedVertices ? {...geometry, coordinates: results.map(item => item.polygon)} : geometry,
      removedVertices};
  }
  if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
    const results = geometry.geometries.map(normalizeExactDuplicatePolygonGeometry);
    const removedVertices = results.reduce((total, item) => total + item.removedVertices, 0);
    return {geometry: removedVertices ? {...geometry, geometries: results.map(item => item.geometry)} : geometry,
      removedVertices};
  }
  return {geometry, removedVertices: 0};
}

export function normalizeExactDuplicatePolygonFeatures(payload) {
  if (!payload || typeof payload !== 'object') return {payload, removedVertices: 0};
  const normalizeFeature = feature => {
    if (!feature || typeof feature !== 'object') return {feature, removedVertices: 0};
    const result = normalizeExactDuplicatePolygonGeometry(feature.geometry);
    return {feature: result.removedVertices ? {...feature, geometry: result.geometry} : feature,
      removedVertices: result.removedVertices};
  };
  if (payload.type === 'Feature') {
    const result = normalizeFeature(payload);
    return {payload: result.feature, removedVertices: result.removedVertices};
  }
  if (payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    const results = payload.features.map(normalizeFeature);
    const removedVertices = results.reduce((total, item) => total + item.removedVertices, 0);
    return {payload: removedVertices ? {...payload, features: results.map(item => item.feature)} : payload,
      removedVertices};
  }
  const result = normalizeExactDuplicatePolygonGeometry(payload);
  return {payload: result.geometry, removedVertices: result.removedVertices};
}
