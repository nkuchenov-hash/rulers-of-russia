import {createHash} from 'node:crypto';
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
  if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite)
    || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90
    || !Array.isArray(ring) || ring.length < 4) return 'unavailable';
  const first = ring[0], last = ring.at(-1);
  if (!Array.isArray(first) || !Array.isArray(last)
    || first[0] !== last[0] || first[1] !== last[1]) return 'unavailable';
  const vertices = [];
  let previousLon = null;
  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])
      || Math.abs(coordinate[0]) > 180 || Math.abs(coordinate[1]) > 90) return 'unavailable';
    let lon = coordinate[0];
    if (previousLon !== null) {
      while (lon - previousLon > 180) lon -= 360;
      while (lon - previousLon < -180) lon += 360;
    }
    vertices.push([lon, coordinate[1]]);
    previousLon = lon;
  }
  // A collapsed ring has no sovereign area. Use unwrapped longitudes so a
  // legitimate antimeridian crossing is not mistaken for a world-wide edge.
  let twiceArea = 0;
  for (let i = 0; i < vertices.length - 1; i += 1) {
    twiceArea += vertices[i][0] * vertices[i + 1][1] - vertices[i + 1][0] * vertices[i][1];
  }
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= 1e-12) return 'unavailable';
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
  // Validate every interior ring even when this particular probe is outside
  // the exterior or already inside another hole. Otherwise malformed holes
  // can be misreported as definitive "outside" rather than "unavailable".
  const holeLocations = rings.slice(1).map(hole => ringLocation(point, hole));
  if (exterior === 'unavailable' || holeLocations.includes('unavailable')) return 'unavailable';
  if (exterior === 'outside') return 'outside';
  if (holeLocations.includes('boundary')) return 'boundary';
  if (holeLocations.includes('inside')) return 'outside';
  return exterior;
}

function combineLocations(locations) {
  // Never describe a partial or empty source as definitively inside/outside.
  // A valid feature cannot hide an invalid sibling in a collection.
  if (!locations.length || locations.includes('unavailable')) return 'unavailable';
  if (locations.includes('inside')) return 'inside';
  if (locations.includes('boundary')) return 'boundary';
  return 'outside';
}

export function geometryLocation(point, geometry) {
  if (!geometry) return 'unavailable';
  if (geometry.type === 'Polygon') return polygonLocation(point, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return Array.isArray(geometry.coordinates)
    ? combineLocations(geometry.coordinates.map(rings => polygonLocation(point, rings))) : 'unavailable';
  if (geometry.type === 'GeometryCollection') return Array.isArray(geometry.geometries)
    ? combineLocations(geometry.geometries.map(item => geometryLocation(point, item))) : 'unavailable';
  // Valid non-area geometry cannot establish sovereign area. An unknown type
  // is malformed evidence, not evidence that the territory is absent.
  if (['Point', 'MultiPoint', 'LineString', 'MultiLineString'].includes(geometry.type)) return 'outside';
  return 'unavailable';
}

export function geojsonLocation(point, payload) {
  if (!payload) return 'unavailable';
  if (payload.type === 'FeatureCollection') return Array.isArray(payload.features)
    ? combineLocations(payload.features.map(feature => geometryLocation(point, feature?.geometry))) : 'unavailable';
  if (payload.type === 'Feature') return geometryLocation(point, payload.geometry);
  return geometryLocation(point, payload);
}

// Only bounded scalar identities belong in public diagnostics. A source
// property can itself be an object (including embedded geometry); never
// serialize arbitrary nested metadata or unbounded strings into CI artifacts.
const MAX_SOURCE_RECORDS = 20;
// Source records are already public diagnostic metadata. Preserve distinct
// original identities beyond the display cap without leaking full source
// strings: truncation alone collapsed different feature IDs and dated acts.
const sourceScalar = value => {
  if (typeof value === 'string') return value.length <= 160 ? value
    : value.slice(0, 120) + '#sha256=' + createHash('sha256').update(value).digest('hex').slice(0, 16);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

function sourceIdentity(feature) {
  const properties = feature?.properties ?? {};
  return {
    featureId: sourceScalar(feature?.id),
    cat: sourceScalar(properties.cat),
    name: sourceScalar(properties.name),
    lwdate: sourceScalar(properties.lwdate),
    status: sourceScalar(properties.status),
  };
}

function sourceRecordsAtPoint(point, features) {
  const records = [];
  let matchedCount = 0;
  for (const feature of Array.isArray(features) ? features : []) {
    if (!feature || typeof feature !== 'object') continue;
    const location = geometryLocation(point, feature.geometry);
    if (location !== 'inside' && location !== 'boundary') continue;
    matchedCount += 1;
    if (records.length < MAX_SOURCE_RECORDS) records.push({...sourceIdentity(feature), location});
  }
  return {records, matchedCount, truncated: matchedCount > records.length};
}

export function diagnoseEarlyRussiaHotspots({
  year, referencePayload, historyPayload, selectedSourceFeatures = [], excludedSourceFeatures = [],
}) {
  if (!Number.isInteger(year)) return [];
  return EARLY_RUSSIA_HOTSPOTS.filter(hotspot => year >= hotspot.fromYear && year <= hotspot.toYear)
    .map(hotspot => {
      const [lon, lat] = hotspot.lonLat;
      const selectedAtCenter = sourceRecordsAtPoint(hotspot.lonLat, selectedSourceFeatures);
      const excludedAtCenter = sourceRecordsAtPoint(hotspot.lonLat, excludedSourceFeatures);
      return {
        clusterId: hotspot.id,
        sourceInterval: [hotspot.fromYear, hotspot.toYear],
        // Source-derived hotspot positions are used only for in-memory
        // attribution. Publishing them would disclose precise locations.
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
        selectedSourceRecordsAtCenter: selectedAtCenter.records,
        excludedSourceRecordsAtCenter: excludedAtCenter.records,
        selectedSourceRecordsAtCenterMatchedCount: selectedAtCenter.matchedCount,
        excludedSourceRecordsAtCenterMatchedCount: excludedAtCenter.matchedCount,
        selectedSourceRecordsAtCenterTruncated: selectedAtCenter.truncated,
        excludedSourceRecordsAtCenterTruncated: excludedAtCenter.truncated,
        selectedSourceRecordCount: selectedSourceFeatures.length,
        excludedSourceRecordCount: excludedSourceFeatures.length,
      };
    });
}

// Attribute the *actual* worst boundary samples in each failed comparison.
// Fixed hotspot coordinates from an earlier run may no longer lie on the
// current scoped reference boundary (especially after source-scope changes).
// Keep both directions: reference-to-History and History-to-reference can
// identify entirely different missing or extra territorial components.
// Do not serialize either direction's sample coordinates into CI artifacts.
// This is diagnostic-only; no distance threshold or geometry is modified.
export function diagnoseFailedBoundarySamples({
  referenceSamples = [], currentSamples = [], referencePayload, historyPayload,
  selectedSourceFeatures = [], excludedSourceFeatures = [],
}) {
  // Reject unusable samples before limiting the report to three: otherwise
  // a malformed first sample hides a valid fourth worst-distance point.
  const annotate = (samples, sampledBoundary) => (Array.isArray(samples) ? samples : [])
    .filter(sample => Array.isArray(sample?.lonLat) && sample.lonLat.length === 2
      && sample.lonLat.every(Number.isFinite)
      && Math.abs(sample.lonLat[0]) <= 180 && Math.abs(sample.lonLat[1]) <= 90
      && Number.isFinite(sample.distanceMeters) && sample.distanceMeters >= 0)
    // Never assume the caller has pre-sorted the samples. Keep the actual
    // largest discrepancies even when an upstream metric changes ordering.
    .sort((a, b) => b.distanceMeters - a.distanceMeters)
    .slice(0, 3)
    .map(sample => {
      const selected = sourceRecordsAtPoint(sample.lonLat, selectedSourceFeatures);
      const excluded = sourceRecordsAtPoint(sample.lonLat, excludedSourceFeatures);
      // Sample coordinates can reconstruct portions of a licensed Runivers
      // boundary. Use them only in memory for attribution, never in public CI.
      return {
        sampledBoundary,
        distanceMeters: sample.distanceMeters,
        scopedReferenceLocation: geojsonLocation(sample.lonLat, referencePayload),
        historyLocation: geojsonLocation(sample.lonLat, historyPayload),
        selectedSourceRecords: selected.records,
        excludedSourceRecords: excluded.records,
        selectedSourceRecordsMatchedCount: selected.matchedCount,
        excludedSourceRecordsMatchedCount: excluded.matchedCount,
        selectedSourceRecordsTruncated: selected.truncated,
        excludedSourceRecordsTruncated: excluded.truncated,
        diagnosticOnly: true,
      };
    });
  return [
    ...annotate(referenceSamples, 'runivers-reference'),
    ...annotate(currentSamples, 'history-core'),
  ];
}
