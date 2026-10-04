import fs from 'node:fs';
import {referenceForPolity} from './runivers-reference-scope.mjs';
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
  return new Map(docs.map(doc => [doc.id, doc]));
}

function validateOverrides(registry, documents) {
  if (registry.schema_version !== 1 || !Array.isArray(registry.overrides)) throw new Error('Invalid Runivers override registry');
  const seen = new Set();
  const strongTiers = new Set(['A1-archival-original', 'A2-official-document-publication', 'A3-contemporary-official-map']);
  for (const item of registry.overrides) {
    if (!item.id || seen.has(item.id)) throw new Error(`Duplicate/missing Runivers override id: ${item.id}`);
    seen.add(item.id);
    if (!Number.isInteger(item.runiversResourceId)) throw new Error(`${item.id}: runiversResourceId must be an integer`);
    if (!item.startMonth || !item.endMonth || item.startMonth > item.endMonth) throw new Error(`${item.id}: invalid month range`);
    if (!item.reason || item.reason.length < 20) throw new Error(`${item.id}: evidence-backed reason is required`);
    if (!Array.isArray(item.evidenceDocumentIds) || !item.evidenceDocumentIds.length) throw new Error(`${item.id}: evidenceDocumentIds required`);
    for (const id of item.evidenceDocumentIds) {
      const doc = documents.get(id);
      if (!doc) throw new Error(`${item.id}: unknown evidence document ${id}`);
      if (!strongTiers.has(doc.tier)) throw new Error(`${item.id}: ${id} is ${doc.tier}; Runivers overrides require A1/A2/A3 evidence`);
    }
  }
}

function overrideFor(registry, state, resourceId) {
  return registry.overrides.find(item => item.runiversResourceId === resourceId
    && state.firstMonth <= item.endMonth
    && state.lastMonth >= item.startMonth
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
      if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) return payload;
      if (Array.isArray(payload)) {
        const list = payload.map(item => item?.type === 'Feature' ? item : item?.geom
          ? {type: 'Feature', geometry: item.geom, properties: item.fields ?? item.properties ?? {}}
          : null).filter(Boolean);
        if (list.length) return {type: 'FeatureCollection', features: list};
      }
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
  const types = new Set(payloadFeatures(payload).map(feature => feature?.geometry?.type).filter(Boolean));
  const hasPolygon = [...types].some(type => type === 'Polygon' || type === 'MultiPolygon');
  const hasLine = [...types].some(type => type === 'LineString' || type === 'MultiLineString');
  return {types: [...types], hasPolygon, hasLine, usable: hasPolygon || hasLine};
}

function isReferenceApproximate(payload) {
  const text = payloadFeatures(payload).map(feature => JSON.stringify(feature?.properties ?? {})).join(' ').toLowerCase();
  return /(приблиз|условн|неточн|approx|uncertain|reconstruct)/i.test(text);
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

const validCoordinate = point => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);

function samplingLines(payload) {
  const lines = [];
  for (const feature of payloadFeatures(payload)) {
    for (const line of geometryLines(feature?.geometry, true)) if (Array.isArray(line) && line.length >= 2) lines.push(line);
  }
  return lines;
}

function samplePayload(payload, stepMeters = BORDER_SAMPLE_STEP_M, maxSamples = MAX_BORDER_SAMPLES) {
  const lines = samplingLines(payload);
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
  const stride = Math.max(1, Math.ceil(candidateCount / maxSamples));
  const points = [];
  let candidateIndex = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const a = line[i], b = line[i + 1];
      if (!validCoordinate(a) || !validCoordinate(b)) continue;
      const steps = Math.max(1, Math.ceil(haversineMeters(a, b) / stepMeters));
      const segmentStart = candidateIndex, segmentEnd = segmentStart + steps;
      let selected = segmentStart + ((stride - (segmentStart % stride)) % stride);
      while (selected < segmentEnd && points.length < maxSamples) {
        points.push(interpolateLonLat(a, b, (selected - segmentStart) / steps));
        selected += stride;
      }
      candidateIndex = segmentEnd;
    }
    const last = line[line.length - 1];
    if (validCoordinate(last)) {
      if (candidateIndex % stride === 0 && points.length < maxSamples) points.push([last[0], last[1]]);
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
  const coastPoints = samplePayload(payload, COAST_SAMPLE_STEP_M, MAX_COAST_SAMPLES);
  if (coastPoints.length < 100) throw new Error(`Coastline reference produced too few samples: ${coastPoints.length}`);
  return {index: buildPointIndex(coastPoints), samples: coastPoints.length};
}

function politicalBorderSamples(payload, coastIndex) {
  const all = samplePayload(payload, BORDER_SAMPLE_STEP_M, MAX_BORDER_SAMPLES);
  const inland = all.filter(point => distanceToIndex(point, coastIndex) > COAST_EXCLUSION_M);
  return {allCount: all.length, points: inland};
}

function comparePoliticalGeometry(reference, current, referenceClass) {
  if (!reference.points.length || !current.points.length) return {usable: false, referenceSamples: reference.points.length, currentSamples: current.points.length};
  const referenceIndex = buildPointIndex([...reference.points]);
  const currentIndex = buildPointIndex([...current.points]);
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

function toleranceMeters(year, referenceApproximate) {
  if (referenceApproximate) return 100000;
  if (year < 1700) return 50000;
  if (year < 1850) return 35000;
  if (year < 1900) return 25000;
  return 15000;
}

function historyStates(monthIndex) {
  const grouped = new Map();
  for (const month of monthIndex.months ?? []) {
    if (month.month < START_MONTH || month.month > END_MONTH || !month.geometryFile || month.status !== 'geometry-verified') continue;
    const key = month.geometryFile;
    const row = grouped.get(key) ?? {
      key, geometryFile: month.geometryFile, polityId: month.polityId, snapshotId: month.snapshotId ?? null,
      certificationId: month.certificationId ?? null, verificationClass: month.verificationClass ?? null,
      uncertaintyMeters: month.uncertaintyMeters ?? null, evidenceDocumentIds: month.evidenceDocumentIds ?? [],
      firstMonth: month.month, lastMonth: month.month, months: 0,
    };
    if (month.month < row.firstMonth) row.firstMonth = month.month;
    if (month.month > row.lastMonth) row.lastMonth = month.month;
    row.months += 1;
    grouped.set(key, row);
  }
  return [...grouped.values()].sort((a, b) => a.firstMonth.localeCompare(b.firstMonth));
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

function referenceOverlapsState(layer, state, maxRuniversYear) {
  const firstYear = monthToYear(state.firstMonth), lastYear = monthToYear(state.lastMonth);
  for (let year = firstYear; year <= lastYear; year += 1) if (layerContainsYear(layer, year, maxRuniversYear)) return true;
  return false;
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
  const coverage = new Map(states.map(state => [state.key, []]));
  const historySamplesCache = new Map();
  const comparisons = [], referenceFailures = [];
  let usableReferenceCount = 0;

  for (let index = 0; index < relevantLayers.length; index += 1) {
    const layer = relevantLayers[index];
    let geojson;
    try { geojson = await fetchRuniversGeoJson(discovery.host, layer.id); }
    catch (error) { referenceFailures.push({layer, error: error?.message ?? String(error)}); continue; }
    const classification = classifyGeometry(geojson);
    if (!classification.usable) continue;
    usableReferenceCount += 1;
    const referenceSamplesByPolity = new Map();
    const referenceSamples = politicalBorderSamples(geojson, coast.index);
    if (referenceSamples.points.length < 20) {
      referenceFailures.push({layer, error: `Runivers resource ${layer.id} has too few inland political-boundary samples after coastline masking (${referenceSamples.points.length})`});
      continue;
    }
    const overlappingStates = states.filter(state => referenceOverlapsState(layer, state, maxRuniversYear));
    for (const state of overlappingStates) {
      let scoped = referenceSamplesByPolity.get(state.polityId);
      if (!scoped) {
        try {
          const selected = referenceForPolity(geojson, state.polityId);
          scoped = {samples: politicalBorderSamples(selected.payload, coast.index),
            approximate: isReferenceApproximate(selected.payload), scope: selected.scope};
          if (scoped.samples.points.length < 20) throw new Error('Too few scoped political-boundary samples');
          referenceSamplesByPolity.set(state.polityId, scoped);
        } catch (error) {
          referenceFailures.push({layer, polityId: state.polityId, error: error.message});
          continue;
        }
      }
      const approximate = scoped.approximate;
      let currentSamples = historySamplesCache.get(state.key);
      if (!currentSamples) {
        currentSamples = politicalBorderSamples(loadHistoryGeometry(state), coast.index);
        historySamplesCache.set(state.key, currentSamples);
      }
      const metric = comparePoliticalGeometry(scoped.samples, currentSamples, classification);
      if (!metric.usable) continue;
      const comparisonYear = Math.max(layer.fromYear, monthToYear(state.firstMonth));
      const tolerance = toleranceMeters(comparisonYear, approximate), maxTolerance = tolerance * 4;
      const override = overrideFor(overrides, state, layer.id);
      const passMetric = metric.symmetricP95Meters <= tolerance && metric.symmetricMaxMeters <= maxTolerance;
      const status = passMetric ? 'pass' : override ? 'override' : 'fail';
      const row = {
        referenceScope: scoped.scope, status, runiversResourceId: layer.id, runiversName: layer.displayName,
        runiversFromYear: layer.fromYear, runiversToYear: layer.toYear,
        runiversIntervalSemantics: layer.toYear === maxRuniversYear ? 'terminal-inclusive' : 'half-open',
        runiversApproximate: approximate, historyGeometryFile: state.geometryFile, polityId: state.polityId,
        snapshotId: state.snapshotId, certificationId: state.certificationId,
        historyFirstMonth: state.firstMonth, historyLastMonth: state.lastMonth,
        historyVerificationClass: state.verificationClass, historyUncertaintyMeters: state.uncertaintyMeters,
        toleranceMeters: tolerance, maxToleranceMeters: maxTolerance, ...metric, overrideId: override?.id ?? null,
      };
      comparisons.push(row);
      coverage.get(state.key).push(row);
    }
    if ((index + 1) % 20 === 0 || index + 1 === relevantLayers.length) console.log(`Runivers regression progress: ${index + 1}/${relevantLayers.length} dated layers; ${comparisons.length} comparisons.`);
  }

  const stateCoverage = states.map(state => {
    const rows = coverage.get(state.key) ?? [];
    return {...state, referenceComparisons: rows.length, passes: rows.filter(row => row.status === 'pass').length,
      overrides: rows.filter(row => row.status === 'override').length, failures: rows.filter(row => row.status === 'fail').length};
  });
  const missingStates = stateCoverage.filter(state => state.referenceComparisons === 0);
  const failedComparisons = comparisons.filter(row => row.status === 'fail');
  const stateCoverageByGeometry = new Map(stateCoverage.map(state => [state.geometryFile, state]));
  const uncoveredMonths = [];
  for (const month of monthIndex.months ?? []) {
    if (month.month < START_MONTH || month.month > END_MONTH) continue;
    if (month.status !== 'geometry-verified' || !month.geometryFile) {
      uncoveredMonths.push({month: month.month, reason: 'History Core is not geometry-verified', geometryFile: month.geometryFile ?? null});
      continue;
    }
    const coverageRow = stateCoverageByGeometry.get(month.geometryFile);
    if (!coverageRow || coverageRow.referenceComparisons === 0) {
      uncoveredMonths.push({month: month.month, reason: 'No overlapping Runivers reference comparison', geometryFile: month.geometryFile});
      continue;
    }
    const year = monthToYear(month.month);
    const overlappingRows = (coverage.get(coverageRow.key) ?? []).filter(row => layerContainsYear({fromYear: row.runiversFromYear, toYear: row.runiversToYear}, year, maxRuniversYear));
    if (!overlappingRows.length) uncoveredMonths.push({month: month.month, reason: 'No dated Runivers layer covers this month year', geometryFile: month.geometryFile});
  }

  const summary = {
    auditedRange: {startMonth: START_MONTH, endMonth: END_MONTH}, runiversHost: discovery.host,
    runiversBoundaryRoot: discovery.boundaryRoot ?? null, runiversBaselineParent: discovery.currentBaselineParent ?? null,
    runiversLayersDiscovered: discovery.vectorLayers?.length ?? 0, datedLayersAudited: relevantLayers.length,
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
  fs.writeFileSync(reportFile, JSON.stringify({schema_version: 2, generatedAt: new Date().toISOString(), summary, stateCoverage, failedComparisons, referenceFailures, uncoveredMonths}, null, 2));
  console.log('Runivers geometric regression summary:', JSON.stringify(summary));
  console.log(`Report: ${reportFile}`);
  if (referenceFailures.length || !usableReferenceCount || missingStates.length || uncoveredMonths.length || failedComparisons.length) process.exitCode = 1;
}

export {buildCoastIndex, politicalBorderSamples, comparePoliticalGeometry, layerContainsYear, distanceToIndex};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
