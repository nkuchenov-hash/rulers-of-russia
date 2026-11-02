import {hasValidRingTopology, hasValidPolygonTopology} from './runivers-ring-topology.mjs';

// Diagnostic only: report aggregate reasons a third-party polygon cannot be
// used as independent evidence. Never return coordinates, feature metadata,
// or repaired geometry; the acceptance validator remains authoritative.
export function summarizePolygonFailures(payload) {
  const counts = {
    polygons: 0, validPolygons: 0, emptyPolygons: 0,
    malformedRings: 0, invalidWgs84Rings: 0, unclosedRings: 0,
    invalidRingTopology: 0, invalidHoleTopology: 0,
  };
  const validPosition = point => Array.isArray(point) && point.length >= 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

  const inspectPolygon = polygon => {
    counts.polygons++;
    if (!Array.isArray(polygon) || polygon.length === 0) {
      counts.emptyPolygons++;
      return;
    }
    let allRingsValid = true;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        counts.malformedRings++;
        allRingsValid = false;
      } else if (!ring.every(validPosition)) {
        counts.invalidWgs84Rings++;
        allRingsValid = false;
      } else if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
        counts.unclosedRings++;
        allRingsValid = false;
      } else if (!hasValidRingTopology(ring)) {
        counts.invalidRingTopology++;
        allRingsValid = false;
      }
    }
    if (allRingsValid) {
      if (hasValidPolygonTopology(polygon)) counts.validPolygons++;
      else counts.invalidHoleTopology++;
    }
  };
  const inspectGeometry = geometry => {
    if (!geometry || typeof geometry !== 'object') return;
    if (geometry.type === 'Polygon') inspectPolygon(geometry.coordinates);
    else if (geometry.type === 'MultiPolygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) inspectPolygon(null);
      else geometry.coordinates.forEach(inspectPolygon);
    } else if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach(inspectGeometry);
    }
  };
  const features = payload?.type === 'FeatureCollection' ? payload.features
    : payload?.type === 'Feature' ? [payload] : [{geometry: payload}];
  if (Array.isArray(features)) for (const feature of features) inspectGeometry(feature?.geometry);
  return counts;
}
