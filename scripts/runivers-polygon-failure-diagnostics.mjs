import {hasValidRingTopology, hasValidPolygonTopology, ringTopologyFailureReason, polygonHoleTopologyFailureReason} from './runivers-ring-topology.mjs';

// Diagnostic only: report aggregate reasons a third-party polygon cannot be
// used as independent evidence. Never return coordinates, feature metadata,
// or repaired geometry; the acceptance validator remains authoritative.
export function summarizePolygonFailures(payload) {
  const counts = {
    polygons: 0, validPolygons: 0, emptyPolygons: 0,
    malformedRings: 0, invalidWgs84Rings: 0, unclosedRings: 0,
    invalidRingTopology: 0, invalidHoleTopology: 0,
    invalidHoleReasons: {'hole-outside-shell': 0, 'hole-crosses-shell': 0,
      'holes-cross-or-touch': 0, 'holes-nested': 0},
    // Counts are primary reasons for rings already rejected by the unchanged gate.
    invalidRingReasons: {'ambiguous-half-world-edge': 0, 'antipodal-pole-edge': 0,
      'unwrapped-open-ring': 0, 'zero-area': 0, 'zero-length-edge': 0,
      'repeated-pole': 0, 'backtracking-edge': 0, 'self-intersection': 0},
    // First eight invalid polygons, by zero-based transport-local indexes only.
    // No source IDs, properties, vertices or coordinates are emitted.
    firstInvalidPolygons: [],
  };
  const validPosition = point => Array.isArray(point) && point.length >= 2
    && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

  const inspectPolygon = (polygon, featureIndex, polygonIndex, collectionPath) => {
    counts.polygons++;
    const recordFailure = (reason, ringIndex = null) => {
      if (counts.firstInvalidPolygons.length < 8) counts.firstInvalidPolygons.push({
        featureIndex, polygonIndex, collectionPath, ringIndex, reason,
      });
    };
    if (!Array.isArray(polygon) || polygon.length === 0) {
      counts.emptyPolygons++;
      recordFailure('empty-polygon');
      return;
    }
    let allRingsValid = true;
    let firstRingFailure = null;
    for (const [ringIndex, ring] of polygon.entries()) {
      if (!Array.isArray(ring) || ring.length < 4) {
        counts.malformedRings++;
        firstRingFailure ??= {reason: 'malformed-ring', ringIndex};
        allRingsValid = false;
      } else if (!ring.every(validPosition)) {
        counts.invalidWgs84Rings++;
        firstRingFailure ??= {reason: 'invalid-wgs84-ring', ringIndex};
        allRingsValid = false;
      } else if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) {
        counts.unclosedRings++;
        firstRingFailure ??= {reason: 'unclosed-ring', ringIndex};
        allRingsValid = false;
      } else if (!hasValidRingTopology(ring)) {
        counts.invalidRingTopology++;
        const reason = ringTopologyFailureReason(ring);
        if (Object.hasOwn(counts.invalidRingReasons, reason)) counts.invalidRingReasons[reason]++;
        firstRingFailure ??= {reason: reason ?? 'invalid-ring-topology', ringIndex};
        allRingsValid = false;
      }
    }
    if (allRingsValid) {
      if (hasValidPolygonTopology(polygon)) counts.validPolygons++;
      else {
        counts.invalidHoleTopology++;
        const reason = polygonHoleTopologyFailureReason(polygon);
        if (Object.hasOwn(counts.invalidHoleReasons, reason)) counts.invalidHoleReasons[reason]++;
        recordFailure(reason ?? 'invalid-hole-topology');
      }
    } else {
      recordFailure(firstRingFailure?.reason ?? 'invalid-ring', firstRingFailure?.ringIndex ?? null);
    }
  };
  const inspectGeometry = (geometry, featureIndex, collectionPath = []) => {
    if (!geometry || typeof geometry !== 'object') return;
    if (geometry.type === 'Polygon') inspectPolygon(geometry.coordinates, featureIndex, 0, collectionPath);
    else if (geometry.type === 'MultiPolygon') {
      if (!Array.isArray(geometry.coordinates) || !geometry.coordinates.length) {
        inspectPolygon(null, featureIndex, 0, collectionPath);
      } else geometry.coordinates.forEach((polygon, index) =>
        inspectPolygon(polygon, featureIndex, index, collectionPath));
    } else if (geometry.type === 'GeometryCollection' && Array.isArray(geometry.geometries)) {
      geometry.geometries.forEach((child, index) =>
        inspectGeometry(child, featureIndex, [...collectionPath, index]));
    }
  };
  const features = payload?.type === 'FeatureCollection' ? payload.features
    : payload?.type === 'Feature' ? [payload] : [{geometry: payload}];
  if (Array.isArray(features)) for (const [index, feature] of features.entries()) {
    inspectGeometry(feature?.geometry, index);
  }
  return counts;
}
