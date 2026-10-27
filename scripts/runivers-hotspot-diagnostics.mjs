// Research-only attribution of the five documented early-Russia Runivers
// discrepancy clusters (issue #326). Never use these probes to alter geometry,
// certify a border, relax a tolerance, or promote Runivers data to production.
// The probes sample locations in degrees, NOT distances or historical claims.
export const EARLY_RUSSIA_HOTSPOTS = Object.freeze([
  {id: 'north-ob-1510-1551', fromYear: 1510, toYear: 1551, lonLat: [66.97265625, 67.57571742]},
  {id: 'central-1553-1556', fromYear: 1553, toYear: 1556, lonLat: [40.78125, 53.54030739]},
  {id: 'central-1557-1584', fromYear: 1557, toYear: 1584, lonLat: [40.4296875, 52.64306344]},
  {id: 'siberia-1584-1597', fromYear: 1584, toYear: 1597, lonLat: [75.5859375, 54.11094294]},
  {id: 'siberia-1597-1599', fromYear: 1597, toYear: 1599, lonLat: [82.353515625, 54.92714186]},
]);

const PROBES = [
  {direction: 'center', deltaLonLatDegrees: [0, 0]},
  {direction: 'east', deltaLonLatDegrees: [0.25, 0]},
  {direction: 'west', deltaLonLatDegrees: [-0.25, 0]},
  {direction: 'north', deltaLonLatDegrees: [0, 0.25]},
  {direction: 'south', deltaLonLatDegrees: [0, -0.25]},
];
const EPS = 1e-9;

function pointOnSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const cross = (p[0] - a[0]) * dy - (p[1] - a[1]) * dx;
  return Math.abs(cross) <= EPS * Math.max(1, Math.abs(dx), Math.abs(dy))
    && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS
    && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;
}

// Unwrap consecutive GeoJSON longitudes before ray casting. This avoids a
// spurious world-spanning edge at the antimeridian in Siberian source polygons.
// Boundary is reported separately because the five hotspots are contour
// samples and exact on-edge inclusion is not a meaningful sovereignty verdict.
function ringLocation(point, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 'unavailable';
  const vertices = [];
  let previousLon = null;
  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return 'unavailable';
    let lon = coordinate[0];
    if (previousLon !== null) {
      while (lon - previousLon > 180) lon -= 360;
      while (lon - previousLon < -180) lon += 360;
    }
    vertices.push([lon, coordinate[1]]);
    previousLon = lon;
  }
  let low = Infinity, high = -Infinity;
  for (const vertex of vertices) {
    low = Math.min(low, vertex[0]);
    high = Math.max(high, vertex[0]);
  }
  const x = point[0] + 360 * Math.round(((low + high) / 2 - point[0]) / 360);
  const p = [x, point[1]];
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    if (pointOnSegment(p, a, b)) return 'boundary';
    if ((a[1] > p[1]) !== (b[1] > p[1])
      && x < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

function polygonLocation(point, rings) {
  if (!Array.isArray(rings) || !rings.length) return 'unavailable';
  const exterior = ringLocation(point, rings[0]);
  if (exterior !== 'inside' && exterior !== 'boundary') return exterior;
  for (const hole of rings.slice(1)) {
    const location = ringLocation(point, hole);
    if (location === 'unavailable') return 'unavailable';
    if (location === 'boundary') return 'boundary';
    if (location === 'inside') return 'outside';
  }
  return exterior;
}

function combineLocations(locations) {
  if (locations.includes('inside')) return 'inside';
  if (locations.includes('boundary')) return 'boundary';
  if (locations.includes('unavailable')) return 'unavailable';
  return 'outside';
}

export function geometryLocation(point, geometry) {
  if (!geometry) return 'unavailable';
  if (geometry.type === 'Polygon') return polygonLocation(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return combineLocations((geometry.coordinates ?? [])
    .map(rings => polygonLocation(point, rings)));
  if (geometry.type === 'GeometryCollection') return combineLocations((geometry.geometries ?? [])
    .map(item => geometryLocation(point, item)));
  // Points and lines do not establish sovereign area.
  return 'outside';
}

export function geojsonLocation(point, payload) {
  if (!payload) return 'unavailable';
  if (payload.type === 'FeatureCollection') return combineLocations((payload.features ?? [])
    .map(feature => geometryLocation(point, feature.geometry)));
  if (payload.type === 'Feature') return geometryLocation(point, payload.geometry);
  return geometryLocation(point, payload);
}

function sourceIdentity(feature) {
  const properties = feature.properties ?? {};
  return {
    featureId: feature.id ?? null,
    cat: properties.cat ?? null,
    name: properties.name ?? null,
    lwdate: properties.lwdate ?? null,
    status: properties.status ?? null,
  };
}

function sourceRecordsAtPoint(point, features) {
  return (features ?? []).flatMap(feature => {
    const location = geometryLocation(point, feature.geometry);
    return location === 'inside' || location === 'boundary'
      ? [{...sourceIdentity(feature), location}] : [];
  });
}

export function diagnoseEarlyRussiaHotspots({
  year, referencePayload, historyPayload, selectedSourceFeatures = [], excludedSourceFeatures = [],
}) {
  if (!Number.isInteger(year)) return [];
  return EARLY_RUSSIA_HOTSPOTS.filter(hotspot => year >= hotspot.fromYear && year <= hotspot.toYear)
    .map(hotspot => {
      const [lon, lat] = hotspot.lonLat;
      return {
        clusterId: hotspot.id,
        sourceInterval: [hotspot.fromYear, hotspot.toYear],
        lonLat: hotspot.lonLat,
        diagnosticOnly: true,
        probeOffsetUnits: 'longitude/latitude degrees (not metres)',
        probes: PROBES.map(({direction, deltaLonLatDegrees}) => {
          const point = [lon + deltaLonLatDegrees[0], lat + deltaLonLatDegrees[1]];
          return {
            direction, deltaLonLatDegrees,
            scopedReferenceLocation: geojsonLocation(point, referencePayload),
            historyLocation: geojsonLocation(point, historyPayload),
          };
        }),
        selectedSourceRecordsAtCenter: sourceRecordsAtPoint(hotspot.lonLat, selectedSourceFeatures),
        excludedSourceRecordsAtCenter: sourceRecordsAtPoint(hotspot.lonLat, excludedSourceFeatures),
        selectedSourceRecordCount: selectedSourceFeatures.length,
        excludedSourceRecordCount: excludedSourceFeatures.length,
      };
    });
}
