import fs from 'node:fs';
import crypto from 'node:crypto';
import polygonClipping from 'polygon-clipping';
import {referenceForPolity} from './runivers-reference-scope.mjs';
import {publicReferenceFailure} from './runivers-public-reference-failures.mjs';
import {diagnoseEarlyRussiaHotspots, diagnoseFailedBoundarySamples} from './runivers-hotspot-diagnostics.mjs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {feature as topologyFeature} from 'topojson-client';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const dataRoot = path.join(publicRoot, 'data', 'history-core');
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const monthIndexFile = process.env.RUNIVERS_MONTH_INDEX_FILE || path.join(dataRoot, 'generated', 'month-index.json');
const overrideFile = path.join(dataRoot, 'references', 'runivers-overrides.json');
const coastlineFile = createRequire(import.meta.url).resolve('world-atlas/land-50m.json');
const reportDir = path.join(root, 'tmp', 'runivers-regression');
const reportFile = path.join(reportDir, 'report.json');
const START_MONTH = process.env.RUNIVERS_START_MONTH || '1462-01';
const END_MONTH = process.env.RUNIVERS_END_MONTH || '2020-12';
const EARTH_RADIUS_M = 6371008.8;
const BORDER_SAMPLE_STEP_M = 5000;
const COAST_SAMPLE_STEP_M = 20000;
const COAST_EXCLUSION_M = 100000;
const MAX_BORDER_SAMPLES = 20000;
const MAX_COAST_SAMPLES = 30000;
const FETCH_TIMEOUT_MS = 30000;
const FETCH_RETRIES = 3;

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const monthToYear = month => Number(String(month).slice(0, 4));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
};

// Source evidence IDs are stable references, not last-writer-wins labels.
// A duplicate ID could silently replace an A1/A2/A3 document with a weaker
// record (or vice versa) and invalidate the provenance of a border override.
function indexCanonicalDocuments(docs) {
  const indexed = new Map();
  for (const doc of docs) {
    if (typeof doc?.id !== 'string' || !doc.id.trim()) throw new Error('Canonical document has no valid id');
    if (indexed.has(doc.id)) throw new Error(`Duplicate canonical document id: ${doc.id}`);
    indexed.set(doc.id, doc);
  }
  return indexed;
}

function canonicalDocuments() {
  const docs = [];
  const base = path.join(dataRoot, 'documents.json');
  if (fs.existsSync(base)) docs.push(...(readJson(base).documents ?? []));
  const dir = path.join(dataRoot, 'documents');
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort()) {
      docs.push(...(readJson(path.join(dir, name)).documents ?? []));
    }
  }
  return indexCanonicalDocuments(docs);
}

function validateOverrides(registry, documents) {
  if (registry.schema_version !== 1 || !Array.isArray(registry.overrides)) throw new Error('Invalid Runivers override registry');
  const seen = new Set();
  const strongTiers = new Set(['A1-archival-original', 'A2-official-document-publication', 'A3-contemporary-official-map']);
  for (const item of registry.overrides) {
    if (typeof item?.id !== 'string' || !item.id.trim() || seen.has(item.id)) throw new Error(`Duplicate/missing Runivers override id: ${item?.id}`);
    seen.add(item.id);
    if (!Number.isSafeInteger(item.runiversResourceId) || item.runiversResourceId <= 0) throw new Error(`${item.id}: runiversResourceId must be a positive safe integer`);
    // These ranges are compared lexicographically to full-year boundaries.
    // Accepting arbitrary strings (e.g. 1600-99) could authorize a mismatch
    // without a real calendar month ever being documented.
    const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    if (!validMonth(item.startMonth) || !validMonth(item.endMonth) || item.startMonth > item.endMonth) throw new Error(`${item.id}: invalid month range`);
    if (!item.reason || item.reason.length < 20) throw new Error(`${item.id}: evidence-backed reason is required`);
    if (!Array.isArray(item.evidenceDocumentIds) || !item.evidenceDocumentIds.length) throw new Error(`${item.id}: evidenceDocumentIds required`);
    for (const id of item.evidenceDocumentIds) {
      const doc = documents.get(id);
      if (!doc) throw new Error(`${item.id}: unknown evidence document ${id}`);
      if (!strongTiers.has(doc.tier)) throw new Error(`${item.id}: ${id} is ${doc.tier}; Runivers overrides require A1/A2/A3 evidence`);
    }
  }
}

// A documentary exception is valid only for the ENTIRE calendar-year
// intersection actually compared. A one-month override must never exempt a
// multi-year mismatch merely because it overlaps the History Core state.
function overrideFor(registry, state, layer, maxRuniversYear) {
  const firstYear = Math.max(firstFullYearOfState(state), layer.fromYear);
  const lastYear = Math.min(lastFullYearOfState(state),
    layer.toYear === maxRuniversYear ? layer.toYear : layer.toYear - 1);
  if (firstYear > lastYear) return null;
  const firstMonth = `${String(firstYear).padStart(4, '0')}-01`;
  const lastMonth = `${String(lastYear).padStart(4, '0')}-12`;
  return registry.overrides.find(item => item.runiversResourceId === layer.id
    && item.startMonth <= firstMonth && item.endMonth >= lastMonth
    && (!item.polityId || item.polityId === state.polityId)
    && (!item.snapshotId || item.snapshotId === state.snapshotId)
    && (!item.certificationId || item.certificationId === state.certificationId)) ?? null;
}

async function getJson(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {signal: controller.signal, headers: {accept: 'application/json,*/*'}, redirect: 'follow'});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) await delay(500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Unable to fetch ${url}`);
}

async function fetchRuniversGeoJson(host, id) {
  const urls = [`${host}/api/resource/${id}/geojson`, `${host}/api/resource/${id}/feature/?srs=4326&geom_format=geojson`];
  const errors = [];
  for (const url of urls) {
    try {
      const payload = await getJson(url);
      let normalized = null;
      if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) normalized = payload;
      if (Array.isArray(payload)) {
        const list = payload.map(item => item?.type === 'Feature' ? item : item?.geom
          ? {type: 'Feature', id: item.id ?? null, geometry: item.geom, properties: item.fields ?? item.properties ?? {}}
          : null).filter(Boolean);
        if (list.length) normalized = {type: 'FeatureCollection', features: list};
      }
      // A 200 response with an empty or point-only export must not prevent
      // trying the alternate WGS84 endpoint. Both failures remain visible if
      // neither endpoint supplies a usable independent border.
      if (!normalized) throw new Error('no valid GeoJSON feature collection');
      requireUsableReferenceGeometry(normalized, id);
      return normalized;
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? error}`);
    }
  }
  throw new Error(`Runivers resource ${id} export failed: ${errors.join(' | ')}`);
}

function payloadFeatures(payload) {
  if (payload?.type === 'FeatureCollection') return payload.features ?? [];
  if (payload?.type === 'Feature') return [payload];
  if (payload?.type && payload.coordinates) return [{type: 'Feature', geometry: payload, properties: {}}];
  return [];
}

function geometryLines(geometry, outerOnly = true) {
  if (!geometry) return [];
  const {type, coordinates} = geometry;
  if (type === 'LineString') return [coordinates];
  if (type === 'MultiLineString') return coordinates;
  if (type === 'Polygon') return outerOnly ? (coordinates[0] ? [coordinates[0]] : []) : coordinates;
  if (type === 'MultiPolygon') return coordinates.flatMap(polygon => outerOnly ? (polygon[0] ? [polygon[0]] : []) : polygon);
  if (type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap(item => geometryLines(item, outerOnly));
  return [];
}

function classifyGeometry(payload) {
  // A type label alone is not a border. NextGIS can return HTTP 200 with an
  // empty Polygon, a collapsed LineString, or coordinates in projected metres.
  // Reject those before they prevent a WGS84 fallback from being attempted.
  // GeometryCollection members must be inspected recursively: a valid nested
  // polygon is still a usable independent reference.
  const types = new Set();
  let hasPolygon = false, hasLine = false, invalidPolygon = false, invalidGeometry = false;
  const wgs84Point = point => validCoordinate(point)
    && Math.abs(point[0]) <= 180.000001 && Math.abs(point[1]) <= 90.000001;
  const validLine = line => Array.isArray(line) && line.length >= 2
    && line.every(wgs84Point)
    && line.some(point => point[0] !== line[0][0] || point[1] !== line[0][1]);
  const validRing = ring => {
    if (!validLine(ring) || ring.length < 4) return false;
    const first = ring[0], last = ring.at(-1);
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
    // A closed but collinear ring encloses no territory.
    let twiceArea = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(twiceArea) > 1e-12;
  };
  // Every ring matters: an otherwise valid exterior with a malformed hole
  // can break polygon dissolution or create a false national boundary.
  // Reject the entire transport instead of silently dropping bad members.
  const validPolygon = polygon => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing);
  const inspect = geometry => {
    if (!geometry || typeof geometry.type !== 'string') {
      invalidGeometry = true;
      return;
    }
    types.add(geometry.type);
    const c = geometry.coordinates;
    if (geometry.type === 'GeometryCollection') {
      if (!Array.isArray(geometry.geometries) || !geometry.geometries.length) {
        invalidGeometry = true;
      } else {
        for (const member of geometry.geometries) inspect(member);
      }
    } else if (geometry.type === 'Polygon') {
      if (validPolygon(c)) hasPolygon = true;
      else invalidPolygon = true;
    } else if (geometry.type === 'MultiPolygon') {
      if (Array.isArray(c) && c.length > 0 && c.every(validPolygon)) hasPolygon = true;
      else invalidPolygon = true;
    } else if (geometry.type === 'LineString') {
      if (validLine(c)) hasLine = true;
      else invalidGeometry = true;
    } else if (geometry.type === 'MultiLineString') {
      // A valid first segment must not hide a malformed second segment.
      if (Array.isArray(c) && c.length > 0 && c.every(validLine)) hasLine = true;
      else invalidGeometry = true;
    } else if (geometry.type === 'Point') {
      if (!wgs84Point(c)) invalidGeometry = true;
    } else if (geometry.type === 'MultiPoint') {
      if (!Array.isArray(c) || !c.length || !c.every(wgs84Point)) invalidGeometry = true;
    } else {
      invalidGeometry = true;
    }
  };
  for (const feature of payloadFeatures(payload)) inspect(feature?.geometry);
  return {types: [...types], hasPolygon, hasLine, invalidPolygon, invalidGeometry, usable: hasPolygon || hasLine};
}

// A successful HTTP response is not proof of usable geographic reference.
// Treat empty, point-only, or otherwise unsupported exports as reference
// failures, rather than silently removing them from the readiness denominator.
function requireUsableReferenceGeometry(payload, resourceId) {
  const classification = classifyGeometry(payload);
  if (!classification.usable) {
    throw new Error(`Runivers resource ${resourceId} export has no usable polygon or line geometry (types: ${classification.types.join(', ') || 'none'})`);
  }
  if (classification.invalidPolygon) {
    throw new Error(`Runivers resource ${resourceId} export contains malformed polygon rings; cannot certify a complete border`);
  }
  // A valid polygon alongside an invalid auxiliary feature or nested member
  // is a partial export, not an independently certified complete border.
  if (classification.invalidGeometry) {
    throw new Error(`Runivers resource ${resourceId} export contains malformed or unsupported geometry; cannot certify a complete border`);
  }
  // A line-only map can match one edge of a state while omitting every other
  // sovereign border. It cannot certify a complete territorial polygon.
  if (!classification.hasPolygon) {
    throw new Error(`Runivers resource ${resourceId} export has no usable polygon geometry (line-only reference; types: ${classification.types.join(', ')})`);
  }
  return classification;
}

// Approximation changes the geographic tolerance (up to 100 km). A metadata
// *key* such as "approximate": false is not evidence that a map is approximate.
// Only affirmative flags or descriptive text can activate the existing policy.
const approximationMarker = /(приблиз|условн|неточн|approx|uncertain|reconstruct)/i;
const explicitNonApproximation = /^(?:false|no|нет|0|none|n\/a)$/i;
// Free-text descriptions can explicitly NEGATE approximation without being
// exactly "not approximate". Such source notes must never grant the more
// permissive 100 km tolerance merely because they contain "approximate".
// A mixed positive/negative note is ambiguous: fail closed at the strict
// tolerance until its source meaning has been independently reviewed.
const negatedApproximation = /(?:^|[\s,;:(])(?:not[-\s]+|non[-\s]*|no\s+)(?:approximate|approximation|uncertain|reconstructed|reconstruction)(?=$|[\s,.;:!?)])|(?:^|[\s,;:(])не\s+(?:приблизительн[а-яё]*|условн[а-яё]*|неточн[а-яё]*|реконструированн[а-яё]*)(?=$|[\s,.;:!?)])/i;
// Source notes also use key=value / key: value notation. A description like
// "approximate=false" previously matched the affirmative keyword and raised
// the allowable error to 100 km, despite explicitly denying approximation.
const negativeApproximationAssignment = /(?:^|[\s,;({])(?:approximate|approximation|uncertain|reconstructed|reconstruction|приблизительн[а-яё]*|условн[а-яё]*|неточн[а-яё]*)\s*[:=]\s*(?:false|no|нет|0)(?=$|[\s,;)}.!?])/i;

function hasApproximationEvidence(value, key = '') {
  if (Array.isArray(value)) return value.some(item => hasApproximationEvidence(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([name, item]) => hasApproximationEvidence(item, name));
  }
  if (typeof value === 'boolean') return approximationMarker.test(key) && value;
  if (typeof value === 'number') return approximationMarker.test(key) && value === 1;
  if (typeof value !== 'string') return false;
  const label = value.trim();
  if (explicitNonApproximation.test(label) || negatedApproximation.test(label)
    || negativeApproximationAssignment.test(label)) return false;
  return approximationMarker.test(label)
    || (approximationMarker.test(key) && /^(?:true|yes|да|1)$/i.test(label));
}

// Contradictory source fields are not a license to relax a border tolerance.
// A positive flag in one field must not override an explicit negative flag
// or a surveyed-boundary note elsewhere in the same original feature.
function hasExplicitNonApproximation(value, key = '') {
  if (Array.isArray(value)) return value.some(item => hasExplicitNonApproximation(item, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([name, item]) => hasExplicitNonApproximation(item, name));
  }
  if (typeof value === 'boolean') return approximationMarker.test(key) && !value;
  if (typeof value === 'number') return approximationMarker.test(key) && value === 0;
  if (typeof value !== 'string') return false;
  const label = value.trim();
  return negatedApproximation.test(label) || negativeApproximationAssignment.test(label)
    || (approximationMarker.test(key) && explicitNonApproximation.test(label));
}

function isReferenceApproximate(payload) {
  // A mixed source layer may contain an approximate island alongside an
  // explicitly surveyed mainland. One approximate feature must not raise
  // the tolerance for every other border in the dissolved state polygon.
  // Scoping preserves original source properties in sourceProperties; require
  // affirmative approximation evidence for EVERY selected source feature.
  const sourceRecords = payloadFeatures(payload).flatMap(feature => {
    const originals = feature?.properties?.sourceProperties;
    return Array.isArray(originals) ? originals : [feature?.properties ?? {}];
  });
  return sourceRecords.length > 0
    && sourceRecords.every(properties => hasApproximationEvidence(properties)
      && !hasExplicitNonApproximation(properties));
}

function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a[1] * rad, lat2 = b[1] * rad;
  const dLat = (b[1] - a[1]) * rad;
  let dLonDeg = b[0] - a[0];
  if (dLonDeg > 180) dLonDeg -= 360;
  if (dLonDeg < -180) dLonDeg += 360;
  const dLon = dLonDeg * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interpolateLonLat(a, b, t) {
  let dLon = b[0] - a[0];
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  let lon = a[0] + dLon * t;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return [lon, a[1] + (b[1] - a[1]) * t];
}

// The sampling metric assumes WGS84 degrees. Projected metres or an
// impossible latitude can alias a real point in haversine arithmetic and
// must never enter an independent geographic pass.
const validCoordinate = point => Array.isArray(point) && point.length >= 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && Math.abs(point[0]) <= 180.000001 && Math.abs(point[1]) <= 90.000001;

function samplingLines(payload, outerOnly = true) {
  const lines = [];
  for (const feature of payloadFeatures(payload)) {
    for (const line of geometryLines(feature?.geometry, outerOnly)) if (Array.isArray(line) && line.length >= 2) lines.push(line);
  }
  return lines;
}

function samplePayload(payload, stepMeters = BORDER_SAMPLE_STEP_M, maxSamples = MAX_BORDER_SAMPLES, outerOnly = true, anchorsPerRing = 2) {
  const lines = samplingLines(payload, outerOnly);
  // Never silently skip a malformed segment: it may be the only border of
  // an enclave or island, and omitting it could produce a false comparison.
  if (lines.some(line => !line.every(validCoordinate))) {
    throw new Error('Boundary sampling contains invalid WGS84 coordinates');
  }
  let candidateCount = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i], b = line[i + 1];
      if (!validCoordinate(a) || !validCoordinate(b)) continue;
      candidateCount += Math.max(1, Math.ceil(haversineMeters(a, b) / stepMeters));
    }
    if (validCoordinate(line[line.length - 1])) candidateCount += 1;
  }
  if (!candidateCount) return [];
  // A single anchor per disconnected ring is not enough: a displaced
  // island could retain one matching vertex while its opposite shore is
  // completely wrong. Preserve the first vertex AND its geodesically most
  // distant vertex on every ring before applying the global sample budget.
  // Fail closed if the cap cannot cover both ends of every component.
  const anchors = lines.flatMap(line => {
    const first = line.find(validCoordinate);
    if (!first) throw new Error('Boundary ring has no valid sampling coordinate');
    // Preserve the previously pinned physical-coast sampling distribution;
    // the stronger two-shore requirement applies to political borders only.
    if (anchorsPerRing === 1) return [first];
    if (!line.every(validCoordinate)) throw new Error('Boundary ring contains an invalid sampling coordinate');
    let opposite = null, greatestDistance = 0;
    for (let i = 1; i < line.length; i += 1) {
      const distance = haversineMeters(first, line[i]);
      if (distance > greatestDistance) {
        greatestDistance = distance;
        opposite = line[i];
      }
    }
    if (!opposite || greatestDistance <= 0) throw new Error('Boundary ring has no distinct opposite sampling coordinate');
    return [first, opposite];
  });
  if (!Number.isInteger(maxSamples) || maxSamples < 1 || anchors.length > maxSamples) {
    throw new Error(`Cannot sample all ${lines.length} boundary rings with ${anchors.length} minimum anchors within ${maxSamples} samples`);
  }
  const points = anchors.map(point => [point[0], point[1]]);
  const seen = new Set(points.map(point => point.join(',')));
  const budget = maxSamples - points.length;
  const stride = budget > 0 ? Math.max(1, Math.ceil(candidateCount / budget)) : Infinity;
  const append = point => {
    const key = point.join(',');
    if (!seen.has(key) && points.length < maxSamples) {
      points.push(point);
      seen.add(key);
    }
  };
  let candidateIndex = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i], b = line[i + 1];
      if (!validCoordinate(a) || !validCoordinate(b)) continue;
      const steps = Math.max(1, Math.ceil(haversineMeters(a, b) / stepMeters));
      const segmentStart = candidateIndex, segmentEnd = segmentStart + steps;
      let selected = segmentStart + ((stride - (segmentStart % stride)) % stride);
      while (selected < segmentEnd && points.length < maxSamples) {
        append(interpolateLonLat(a, b, (selected - segmentStart) / steps));
        selected += stride;
      }
      candidateIndex = segmentEnd;
    }
    const last = line[line.length - 1];
    if (validCoordinate(last)) {
      if (candidateIndex % stride === 0 && points.length < maxSamples) append([last[0], last[1]]);
      candidateIndex += 1;
    }
  }
  return points;
}

function unitVector(point) {
  const rad = Math.PI / 180, lon = point[0] * rad, lat = point[1] * rad, cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

function buildKdTree(points, depth = 0) {
  if (!points.length) return null;
  const axis = depth % 3;
  points.sort((a, b) => a.xyz[axis] - b.xyz[axis]);
  const mid = Math.floor(points.length / 2);
  return {point: points[mid], axis, left: buildKdTree(points.slice(0, mid), depth + 1), right: buildKdTree(points.slice(mid + 1), depth + 1)};
}

function nearestChordSquared(node, xyz, best = Infinity) {
  if (!node) return best;
  const dx = node.point.xyz[0] - xyz[0], dy = node.point.xyz[1] - xyz[1], dz = node.point.xyz[2] - xyz[2];
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < best) best = d2;
  const delta = xyz[node.axis] - node.point.xyz[node.axis];
  const near = delta < 0 ? node.left : node.right, far = delta < 0 ? node.right : node.left;
  best = nearestChordSquared(near, xyz, best);
  if (delta * delta < best) best = nearestChordSquared(far, xyz, best);
  return best;
}

function chordSquaredToMeters(d2) {
  const chord = Math.min(2, Math.sqrt(Math.max(0, d2)));
  return 2 * EARTH_RADIUS_M * Math.asin(chord / 2);
}

const buildPointIndex = points => buildKdTree(points.map(point => ({point, xyz: unitVector(point)})));
const distanceToIndex = (point, index) => index ? chordSquaredToMeters(nearestChordSquared(index, unitVector(point))) : Infinity;
const directedDistancesToIndex = (sourcePoints, targetIndex) => sourcePoints.length && targetIndex ? sourcePoints.map(point => distanceToIndex(point, targetIndex)) : [];

function buildCoastIndex() {
  if (!fs.existsSync(coastlineFile)) throw new Error(`Coastline reference missing: ${coastlineFile}`);
  // Physical land has no political seams and does not inherit the historical
  // snapshots' reconstructed or displaced coastlines.
  const topology = readJson(coastlineFile);
  const payload = topologyFeature(topology, topology.objects.land);
  // Inland water rings (e.g. the Caspian) are physical shores too.
  // Keep outer-only sampling for political polygons, but include all land rings here.
  const lakeBytes = fs.readFileSync(path.join(publicRoot, 'data/territory/cultural/lakes_50m.geojson'));
  if (crypto.createHash('sha256').update(lakeBytes).digest('hex') !== 'd350b75978b26fe839b797c2c529b2fb8f47fb3983c03f4964e36d5df9378a52') throw new Error('Physical lakes source hash mismatch');
  const shores = {type: 'FeatureCollection', features: [...payloadFeatures(payload), ...payloadFeatures(JSON.parse(lakeBytes))]};
  const coastPoints = samplePayload(shores, COAST_SAMPLE_STEP_M, MAX_COAST_SAMPLES, false, 1);
  if (coastPoints.length < 100) throw new Error(`Coastline reference produced too few samples: ${coastPoints.length}`);
  return {index: buildPointIndex(coastPoints), samples: coastPoints.length};
}

function politicalBorderSamples(payload, coastIndex) {
  // Retain interior rings: an inland hole can be an independent enclave,
  // whose sovereign boundary must be compared in both directions. The old
  // exterior-only conversion silently filled such holes and could falsely
  // certify a state that annexed an enclave. Physical lake/coast rings are
  // still excluded by the independently pinned coastline distance mask.
  // Dissolve complete polygons so an overlapping same-state component inside
  // a hole is not counted as a separate political boundary.
  const polygons = [];
  const collect = geometry => {
    if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
    else if (geometry?.type === 'GeometryCollection') (geometry.geometries ?? []).forEach(collect);
    // Point/line annotations are never a territorial exterior.
  };
  payloadFeatures(payload).forEach(f => collect(f.geometry));
  // Political territory is an area. Auxiliary line annotations in a mixed
  // source are not sovereign borders: including them can manufacture a false
  // discrepancy far from the polygon. A line-only source has no certifiable
  // territorial exterior and therefore yields no comparison samples.
  const features = polygons.length
    ? [{type: 'Feature', properties: {}, geometry: {type: 'MultiPolygon', coordinates: polygonClipping.union(...polygons)}}]
    : [];
  // Include dissolved interior rings as well as exteriors. The physical
  // coastline mask below excludes lake shores; surviving inland holes are
  // possible sovereign enclave borders and must not disappear from the audit.
  const all = samplePayload({type: 'FeatureCollection', features}, BORDER_SAMPLE_STEP_M, MAX_BORDER_SAMPLES, false);
  const inland = all.filter(point => distanceToIndex(point, coastIndex) > COAST_EXCLUSION_M);
  return {allCount: all.length, allPoints: all, points: inland};
}

// Scope by source polity identity BEFORE checking inland sample availability.
// Dissolving an entire multi-polity layer can erase the internal border of the
// target state. A whole-layer coast mask is therefore not a valid early gate.
function prepareScopedReference(payload, polityId, coastIndex) {
  const selected = referenceForPolity(payload, polityId);
  // A whole-layer reference is research-only: it can include neighboring
  // sovereign states and cannot certify the target country's border. Do not
  // allow a coincidental geometric match to be counted as a pass.
  if (selected.scope.diagnosticOnly) throw new Error(`Runivers polity ${polityId} has no reviewed source-identity scope; whole-layer diagnostics cannot certify geography`);
  const samples = politicalBorderSamples(selected.payload, coastIndex);
  if (samples.points.length < 20) throw new Error('Too few scoped political-boundary samples');
  return {samples, approximate: isReferenceApproximate(selected.payload), scope: selected.scope,
    // Research-only in-memory geometry; never serialized into the report.
    referencePayload: selected.payload, sourceFeatures: selected.sourceFeatures};
}

function comparePoliticalGeometry(reference, current, referenceClass) {
  // Do not allow a direct caller to bypass the polygon-only acceptance gate.
  if (!referenceClass.hasPolygon || !reference.points.length || !current.points.length) return {usable: false, referenceSamples: reference.points.length, currentSamples: current.points.length};
  // Mask only the measured source samples. Keep target boundary points near
  // the coast cutoff, otherwise tiny mask differences create artificial gaps.
  const referenceIndex = buildPointIndex([...(reference.allPoints ?? reference.points)]);
  const currentIndex = buildPointIndex([...(current.allPoints ?? current.points)]);
  const refToCurrent = directedDistancesToIndex(reference.points, currentIndex);
  const currentToRef = referenceClass.hasPolygon ? directedDistancesToIndex(current.points, referenceIndex) : [];
  const worstSamples = (points, distances) => distances
    .map((distance, index) => ({lonLat: points[index], distanceMeters: Math.round(distance)}))
    .sort((a, b) => b.distanceMeters - a.distanceMeters).slice(0, 5);
  const refP95 = percentile(refToCurrent, .95), refMax = Math.max(...refToCurrent);
  const curP95 = currentToRef.length ? percentile(currentToRef, .95) : null;
  const curMax = currentToRef.length ? Math.max(...currentToRef) : null;
  return {
    usable: true,
    metric: 'coast-masked-political-boundary-v2',
    coastlineExclusionMeters: COAST_EXCLUSION_M,
    sampleStepMeters: BORDER_SAMPLE_STEP_M,
    referenceBoundarySamplesBeforeCoastMask: reference.allCount,
    currentBoundarySamplesBeforeCoastMask: current.allCount,
    referenceSamples: reference.points.length,
    currentSamples: current.points.length,
    referenceGeometryTypes: referenceClass.types,
    referenceToCurrentP95Meters: Math.round(refP95),
    referenceToCurrentMaxMeters: Math.round(refMax),
    currentToReferenceP95Meters: curP95 === null ? null : Math.round(curP95),
    currentToReferenceMaxMeters: curMax === null ? null : Math.round(curMax),
    symmetricP95Meters: Math.round(Math.max(refP95, curP95 ?? 0)),
    symmetricMaxMeters: Math.round(Math.max(refMax, curMax ?? 0)),
    worstReferenceSamples: worstSamples(reference.points, refToCurrent),
    worstCurrentSamples: worstSamples(current.points, currentToRef),
  };
}

// Explicitly allowlist public comparison metrics. A future in-memory metric
// field must not silently become part of the public Actions artifact (as the
// sampled coordinates did before PR #402). The diagnostic distances and sample
// counts remain unchanged; only the serialization contract is restricted.
const PUBLIC_METRIC_FIELDS = Object.freeze([
  'usable', 'metric', 'coastlineExclusionMeters', 'sampleStepMeters',
  'referenceBoundarySamplesBeforeCoastMask', 'currentBoundarySamplesBeforeCoastMask',
  'referenceSamples', 'currentSamples', 'referenceGeometryTypes',
  'referenceToCurrentP95Meters', 'referenceToCurrentMaxMeters',
  'currentToReferenceP95Meters', 'currentToReferenceMaxMeters',
  'symmetricP95Meters', 'symmetricMaxMeters',
]);

export function publicComparisonMetric(metric) {
  const safeMetric = {};
  for (const field of PUBLIC_METRIC_FIELDS) {
    if (Object.hasOwn(metric, field)) safeMetric[field] = metric[field];
  }
  return safeMetric;
}

// A reference can have valid polygons but zero comparable inland border
// samples on the History Core side (for example after coast masking). Do not
// silently skip that layer: another successful layer could otherwise hide
// incomplete independent geographic coverage in the aggregate audit.
function requireComparablePoliticalGeometry(reference, current, referenceClass) {
  const metric = comparePoliticalGeometry(reference, current, referenceClass);
  if (!metric.usable) {
    throw new Error(`No bilateral political-border comparison: ${metric.referenceSamples} Runivers inland samples and ${metric.currentSamples} History Core inland samples`);
  }
  return metric;
}

function toleranceMeters(year, referenceApproximate) {
  if (referenceApproximate) return 100000;
  if (year < 1700) return 50000;
  if (year < 1850) return 35000;
  if (year < 1900) return 25000;
  return 15000;
}

// A geometry file can recur after a different historical state. Grouping by
// filename alone would bridge the intervening years and falsely compare the
// earlier polygon against references for dates when it was not active.
function nextHistoryMonth(value) {
  let year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)) + 1;
  if (month === 13) { year += 1; month = 1; }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function historyStates(monthIndex) {
  const rows = (monthIndex.months ?? [])
    .filter(month => month.month >= START_MONTH && month.month <= END_MONTH
      && month.geometryFile && month.status === 'geometry-verified')
    .sort((a, b) => a.month.localeCompare(b.month));
  const states = [];
  let previous = null, state = null;
  for (const month of rows) {
    const sameState = state && previous && nextHistoryMonth(previous.month) === month.month
      && state.geometryFile === month.geometryFile
      && state.polityId === month.polityId
      && state.politicalPolityId === (month.politicalPolityId ?? month.polityId ?? null)
      && state.snapshotId === (month.snapshotId ?? null)
      && state.certificationId === (month.certificationId ?? null)
      && state.verificationClass === (month.verificationClass ?? null)
      && state.uncertaintyMeters === (month.uncertaintyMeters ?? null)
      && state.track === (month.track ?? null)
      && state.territorialModel === (month.territorialModel ?? null)
      && state.uncertaintyGeometryFile === (month.uncertaintyGeometryFile ?? null)
      && state.confidence === (month.confidence ?? null)
      && JSON.stringify([...state.evidenceDocumentIds].sort()) === JSON.stringify([...(month.evidenceDocumentIds ?? [])].sort())
      && JSON.stringify([...state.derivedFromChangeIds].sort()) === JSON.stringify([...(month.derivedFromChangeIds ?? [])].sort());
    if (!sameState) {
      state = {
        key: `${month.geometryFile}@${month.month}`,
        geometryFile: month.geometryFile, polityId: month.polityId,
        // Keep distinct monthly political identities even when a source
        // contour is reused (e.g. Tsardom -> Empire in November 1721).
        politicalPolityId: month.politicalPolityId ?? month.polityId ?? null,
        snapshotId: month.snapshotId ?? null,
        certificationId: month.certificationId ?? null,
        verificationClass: month.verificationClass ?? null,
        uncertaintyMeters: month.uncertaintyMeters ?? null,
        track: month.track ?? null,
        territorialModel: month.territorialModel ?? null,
        uncertaintyGeometryFile: month.uncertaintyGeometryFile ?? null,
        confidence: month.confidence ?? null,
        evidenceDocumentIds: month.evidenceDocumentIds ?? [],
        derivedFromChangeIds: month.derivedFromChangeIds ?? [],
        firstMonth: month.month, lastMonth: month.month, months: 0,
      };
      states.push(state);
    }
    state.lastMonth = month.month;
    state.months += 1;
    previous = month;
  }
  return states;
}

// Coverage is keyed by the actual month, not by a reusable geometry filename.
function indexStateCoverageByMonth(states) {
  const result = new Map();
  for (const state of states) {
    for (let month = state.firstMonth; month <= state.lastMonth; month = nextHistoryMonth(month)) {
      if (result.has(month)) throw new Error(`Overlapping Runivers history states at ${month}`);
      result.set(month, state);
    }
  }
  return result;
}

function loadHistoryGeometry(state) {
  const file = path.join(publicRoot, state.geometryFile.replace(/^\//, ''));
  if (!fs.existsSync(file)) throw new Error(`History Core geometry missing: ${state.geometryFile}`);
  return readJson(file);
}

function layerContainsYear(layer, year, maxRuniversYear) {
  if (!Number.isInteger(layer.fromYear) || !Number.isInteger(layer.toYear)) return false;
  return year >= layer.fromYear && (year < layer.toYear || (layer.toYear === maxRuniversYear && year === layer.toYear));
}

// The source layer may include a transition year for which the History Core
// state is valid only from March or until November. Such a year is NOT part of
// the actual comparison, even when the source layer itself covers it.
// Report uncovered months from the compared full-year ledger, not the wider
// reference layer interval.
function comparisonCoversYear(row, year) {
  return Number.isInteger(year)
    && Number.isInteger(row?.comparedFirstYear)
    && Number.isInteger(row?.comparedLastYear)
    && row.comparedFirstYear <= row.comparedLastYear
    && year >= row.comparedFirstYear && year <= row.comparedLastYear;
}

// Runivers intervals are year-granular. A geometry verified for only part of
// a calendar year cannot certify the reference for that entire year. Require
// January through December within the SAME uninterrupted History Core state;
// two different states covering halves of a year do not constitute a match.
function firstFullYearOfState(state) {
  return monthToYear(state.firstMonth) + (state.firstMonth.slice(5, 7) === '01' ? 0 : 1);
}

function lastFullYearOfState(state) {
  return monthToYear(state.lastMonth) - (state.lastMonth.slice(5, 7) === '12' ? 0 : 1);
}

// A single state/layer comparison can cover several calendar years. The
// boundary metric is shared across those years, so its acceptance tolerance
// must be the STRICTEST applicable year (the last, since limits decrease over
// time). Never use the first overlap year to certify later, stricter eras.
function comparisonYearsForState(layer, state, maxRuniversYear) {
  if (!Number.isInteger(layer.fromYear) || !Number.isInteger(layer.toYear)) return null;
  const firstYear = Math.max(layer.fromYear, firstFullYearOfState(state));
  const lastYear = Math.min(lastFullYearOfState(state),
    layer.toYear === maxRuniversYear ? layer.toYear : layer.toYear - 1);
  return firstYear <= lastYear ? {firstYear, lastYear} : null;
}

function referenceOverlapsState(layer, state, maxRuniversYear) {
  return comparisonYearsForState(layer, state, maxRuniversYear) !== null;
}

// Year-granular Runivers layers without an overlapping verified full-year
// History Core state are NOT audited. Record their dated resource identities
// instead of silently dropping them from the comparison loop. This is a
// coverage failure, not an external source outage or a geographic pass.
function unmatchedReferenceLayers(layers, states, maxRuniversYear) {
  return layers.filter(layer => !states.some(state => referenceOverlapsState(layer, state, maxRuniversYear)))
    .map(layer => ({
      runiversResourceId: layer.id,
      runiversFromYear: layer.fromYear,
      runiversToYear: layer.toYear,
      reason: 'No overlapping full-year geometry-verified History Core state; no independent comparison attempted',
    }));
}

async function main() {
  if (!fs.existsSync(discoveryFile)) throw new Error(`Runivers discovery report missing: ${discoveryFile}`);
  if (!fs.existsSync(monthIndexFile)) throw new Error('History Core month index missing; run npm run materialize:history first');
  if (!fs.existsSync(overrideFile)) throw new Error('Runivers override registry missing');

  const discovery = readJson(discoveryFile), monthIndex = readJson(monthIndexFile), overrides = readJson(overrideFile);
  const documents = canonicalDocuments();
  validateOverrides(overrides, documents);
  const coast = buildCoastIndex();

  const states = historyStates(monthIndex);
  const layers = (discovery.vectorLayers ?? [])
    .filter(layer => Number.isInteger(layer.fromYear) && Number.isInteger(layer.toYear))
    .filter(layer => layer.toYear >= 1462 && layer.fromYear <= 2020)
    .sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
  if (!states.length) throw new Error('No History Core geometry-verified states in 1462-2020');
  if (!layers.length) throw new Error('Runivers discovery found no dated vector layers overlapping 1462-2020');
  const maxRuniversYear = discovery.preferredMaxYear ?? Math.max(...layers.map(layer => layer.toYear));

  const relevantLayers = layers.filter(layer => states.some(state => referenceOverlapsState(layer, state, maxRuniversYear)));
  const unmatchedLayers = unmatchedReferenceLayers(layers, states, maxRuniversYear);
  const coverage = new Map(states.map(state => [state.key, []]));
  const historySamplesCache = new Map();
  const comparisons = [], referenceFailures = [];
  let usableReferenceCount = 0;

  for (let index = 0; index < relevantLayers.length; index += 1) {
    const layer = relevantLayers[index];
    let geojson, classification;
    let referenceStage = 'reference-fetch';
    try {
      geojson = await fetchRuniversGeoJson(discovery.host, layer.id);
      referenceStage = 'reference-geometry';
      classification = requireUsableReferenceGeometry(geojson, layer.id);
    } catch (error) {
      // External error strings and discovery-layer objects can contain raw
      // coordinates or licensed metadata. Keep only fixed diagnostic codes.
      referenceFailures.push(publicReferenceFailure({layer, stage: referenceStage}));
      continue;
    }
    const referenceSamplesByPolity = new Map();
    let hasUsableScopedReference = false;
    const overlappingStates = states.filter(state => referenceOverlapsState(layer, state, maxRuniversYear));
    for (const state of overlappingStates) {
      let scoped = referenceSamplesByPolity.get(state.polityId);
      if (!scoped) {
        try {
          scoped = prepareScopedReference(geojson, state.polityId, coast.index);
          referenceSamplesByPolity.set(state.polityId, scoped);
        } catch (error) {
          referenceFailures.push(publicReferenceFailure({layer, polityId: state.polityId, stage: 'polity-scope'}));
          continue;
        }
      }
      const approximate = scoped.approximate;
      let currentSamples = historySamplesCache.get(state.geometryFile);
      if (!currentSamples) {
        currentSamples = politicalBorderSamples(loadHistoryGeometry(state), coast.index);
        historySamplesCache.set(state.geometryFile, currentSamples);
      }
      let metric;
      try {
        metric = requireComparablePoliticalGeometry(scoped.samples, currentSamples, classification);
      } catch (error) {
        referenceFailures.push(publicReferenceFailure({layer, polityId: state.polityId, stage: 'border-comparison'}));
        continue;
      }
      hasUsableScopedReference = true;
      const comparisonYears = comparisonYearsForState(layer, state, maxRuniversYear);
      // overlappingStates guarantees a complete-year intersection.
      if (!comparisonYears) throw new Error('Runivers comparison lacks a full-year overlap');
      const tolerance = toleranceMeters(comparisonYears.lastYear, approximate), maxTolerance = tolerance * 4;
      const override = overrideFor(overrides, state, layer, maxRuniversYear);
      const passMetric = metric.symmetricP95Meters <= tolerance && metric.symmetricMaxMeters <= maxTolerance;
      const status = passMetric ? 'pass' : override ? 'override' : 'fail';
      // Diagnose every failed comparison, not just the XVI-century clusters:
      // otherwise later eras have distances but no original source identities
      // at the worst mismatches. These probes are NOT geographic acceptance.
      // Keep the existing symmetric distance gate and failure status.
      const failedComparison = status === 'fail';
      const earlyPolityFailure = failedComparison
        && (state.polityId === 'grand-moscow' || state.polityId === 'russian-tsardom');
      const historicalPayload = failedComparison ? loadHistoryGeometry(state) : null;
      const hotspotDiagnostics = earlyPolityFailure ? diagnoseEarlyRussiaHotspots({
        year: comparisonYears.firstYear,
        referencePayload: scoped.referencePayload,
        historyPayload: historicalPayload,
        selectedSourceFeatures: scoped.sourceFeatures?.selected ?? [],
        excludedSourceFeatures: scoped.sourceFeatures?.excluded ?? [],
      }) : [];
      // Attribute both directions of the worst mismatch for ALL failed eras.
      // The five fixed issue #326 hotspots remain specific to early Russia.
      // Never include raw Runivers geometry in the audit report.
      const boundarySampleAttribution = failedComparison ? diagnoseFailedBoundarySamples({
        referenceSamples: metric.worstReferenceSamples,
        currentSamples: metric.worstCurrentSamples,
        referencePayload: scoped.referencePayload,
        historyPayload: historicalPayload,
        selectedSourceFeatures: scoped.sourceFeatures?.selected ?? [],
        excludedSourceFeatures: scoped.sourceFeatures?.excluded ?? [],
      }) : [];
      // Worst-sample coordinates are needed in memory for attribution but
      // cannot be copied to public Actions artifacts: the reference-side
      // samples are derived from potentially licensed Runivers geometry.
      const row = {
        referenceScope: scoped.scope, status, runiversResourceId: layer.id, runiversName: layer.displayName,
        runiversFromYear: layer.fromYear, runiversToYear: layer.toYear,
        runiversIntervalSemantics: layer.toYear === maxRuniversYear ? 'terminal-inclusive' : 'half-open',
        comparedFirstYear: comparisonYears.firstYear, comparedLastYear: comparisonYears.lastYear,
        runiversApproximate: approximate, historyGeometryFile: state.geometryFile, polityId: state.polityId,
        snapshotId: state.snapshotId, certificationId: state.certificationId,
        historyFirstMonth: state.firstMonth, historyLastMonth: state.lastMonth,
        historyVerificationClass: state.verificationClass, historyUncertaintyMeters: state.uncertaintyMeters,
        toleranceMeters: tolerance, maxToleranceMeters: maxTolerance, ...publicComparisonMetric(metric), overrideId: override?.id ?? null,
        ...(hotspotDiagnostics.length ? {hotspotDiagnostics} : {}),
        ...(boundarySampleAttribution.length ? {boundarySampleAttribution} : {}),
      };
      comparisons.push(row);
      coverage.get(state.key).push(row);
    }
    if (hasUsableScopedReference) usableReferenceCount += 1;
    if ((index + 1) % 20 === 0 || index + 1 === relevantLayers.length) console.log(`Runivers regression progress: ${index + 1}/${relevantLayers.length} dated layers; ${comparisons.length} comparisons.`);
  }

  const stateCoverage = states.map(state => {
    const rows = coverage.get(state.key) ?? [];
    return {...state, referenceComparisons: rows.length, passes: rows.filter(row => row.status === 'pass').length,
      overrides: rows.filter(row => row.status === 'override').length, failures: rows.filter(row => row.status === 'fail').length};
  });
  const missingStates = stateCoverage.filter(state => state.referenceComparisons === 0);
  const failedComparisons = comparisons.filter(row => row.status === 'fail');
  const stateCoverageByMonth = indexStateCoverageByMonth(stateCoverage);
  const uncoveredMonths = [];
  for (const month of monthIndex.months ?? []) {
    if (month.month < START_MONTH || month.month > END_MONTH) continue;
    if (month.status !== 'geometry-verified' || !month.geometryFile) {
      uncoveredMonths.push({month: month.month, reason: 'History Core is not geometry-verified', geometryFile: month.geometryFile ?? null});
      continue;
    }
    const coverageRow = stateCoverageByMonth.get(month.month);
    if (!coverageRow || coverageRow.geometryFile !== month.geometryFile || coverageRow.polityId !== month.polityId || coverageRow.referenceComparisons === 0) {
      uncoveredMonths.push({month: month.month, reason: 'No overlapping Runivers reference comparison', geometryFile: month.geometryFile});
      continue;
    }
    const year = monthToYear(month.month);
    const overlappingRows = (coverage.get(coverageRow.key) ?? []).filter(row => comparisonCoversYear(row, year));
    if (!overlappingRows.length) uncoveredMonths.push({month: month.month, reason: 'No complete-calendar-year Runivers comparison covers this month', geometryFile: month.geometryFile});
  }

  const summary = {
    auditedRange: {startMonth: START_MONTH, endMonth: END_MONTH}, runiversHost: discovery.host,
    runiversBoundaryRoot: discovery.boundaryRoot ?? null, runiversBaselineParent: discovery.currentBaselineParent ?? null,
    runiversLayersDiscovered: discovery.vectorLayers?.length ?? 0, datedLayersAudited: relevantLayers.length,
    unmatchedReferenceLayers: unmatchedLayers.length,
    usableReferenceLayers: usableReferenceCount, historyStates: states.length, comparisons: comparisons.length,
    passingComparisons: comparisons.filter(row => row.status === 'pass').length,
    overrides: comparisons.filter(row => row.status === 'override').length, failedComparisons: failedComparisons.length,
    referenceFailures: referenceFailures.length, missingStates: missingStates.length, uncoveredMonths: uncoveredMonths.length,
    metric: 'coast-masked-political-boundary-v2', borderSampleStepMeters: BORDER_SAMPLE_STEP_M,
    coastlineReference: 'Natural Earth physical land 1:50m (world-atlas 2.0.2)', coastlineSamples: coast.samples,
    coastlineExclusionMeters: COAST_EXCLUSION_M, maxSamplesPerGeometry: MAX_BORDER_SAMPLES,
    runiversIntervalSemantics: 'half-open chained ranges; terminal year inclusive',
  };
  fs.mkdirSync(reportDir, {recursive: true});
  // Retain numeric evidence for EVERY comparison, including passing ones.
  // The previous report only serialized failures: a green summary could not
  // be audited against actual symmetric border distances. Never serialize
  // Runivers polygons or even sampled reference coordinates into this ledger.
  const comparisonEvidence = comparisons.map(row => ({
    status: row.status,
    runiversResourceId: row.runiversResourceId,
    runiversFromYear: row.runiversFromYear,
    runiversToYear: row.runiversToYear,
    runiversIntervalSemantics: row.runiversIntervalSemantics,
    comparedFirstYear: row.comparedFirstYear,
    comparedLastYear: row.comparedLastYear,
    historyFirstMonth: row.historyFirstMonth,
    historyLastMonth: row.historyLastMonth,
    runiversApproximate: row.runiversApproximate,
    historyGeometryFile: row.historyGeometryFile,
    // Scalar provenance only: never serialize original source polygons.
    // The independent acceptance gate must reject whole-layer diagnostics
    // even when their numeric distances happen to be within tolerance.
    historyPolityId: row.polityId,
    referenceScopeKind: row.referenceScope?.kind ?? null,
    referenceScopePolityId: row.referenceScope?.polityId ?? null,
    referenceScopeSelectedFeatures: row.referenceScope?.selectedFeatures ?? null,
    referenceScopeTotalFeatures: row.referenceScope?.totalFeatures ?? null,
    referenceSamples: row.referenceSamples,
    currentSamples: row.currentSamples,
    // Preserve both directed measurements so the independent acceptance
    // gate can recompute the symmetric score rather than trusting one number.
    // Distances are scalar metrics only; no source coordinates are serialized.
    referenceToCurrentP95Meters: row.referenceToCurrentP95Meters,
    referenceToCurrentMaxMeters: row.referenceToCurrentMaxMeters,
    currentToReferenceP95Meters: row.currentToReferenceP95Meters,
    currentToReferenceMaxMeters: row.currentToReferenceMaxMeters,
    symmetricP95Meters: row.symmetricP95Meters,
    symmetricMaxMeters: row.symmetricMaxMeters,
    toleranceMeters: row.toleranceMeters,
    maxToleranceMeters: row.maxToleranceMeters,
  }));
  fs.writeFileSync(reportFile, JSON.stringify({schema_version: 2, generatedAt: new Date().toISOString(), summary, comparisonEvidence, stateCoverage, failedComparisons, referenceFailures, unmatchedReferenceLayers: unmatchedLayers, uncoveredMonths}, null, 2));
  console.log('Runivers geometric regression summary:', JSON.stringify(summary));
  console.log(`Report: ${reportFile}`);
  if (referenceFailures.length || unmatchedLayers.length || !usableReferenceCount || missingStates.length || uncoveredMonths.length || failedComparisons.length) process.exitCode = 1;
}

export {indexCanonicalDocuments, validateOverrides, comparisonYearsForState, toleranceMeters, overrideFor, isReferenceApproximate, samplePayload, buildCoastIndex, buildPointIndex, politicalBorderSamples, prepareScopedReference, comparePoliticalGeometry, requireComparablePoliticalGeometry, layerContainsYear, comparisonCoversYear, distanceToIndex, requireUsableReferenceGeometry, fetchRuniversGeoJson, historyStates, indexStateCoverageByMonth, unmatchedReferenceLayers};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
