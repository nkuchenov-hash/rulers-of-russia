import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicRoot = path.join(root, 'public');
const dataRoot = path.join(publicRoot, 'data', 'history-core');
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const monthIndexFile = path.join(dataRoot, 'generated', 'month-index.json');
const overrideFile = path.join(dataRoot, 'references', 'runivers-overrides.json');
const reportDir = path.join(root, 'tmp', 'runivers-regression');
const reportFile = path.join(reportDir, 'report.json');
const START_MONTH = '1462-01';
const END_MONTH = '2020-12';
const EARTH_RADIUS_M = 6371008.8;
const SAMPLE_STEP_M = 25000;
const MAX_SAMPLES = 7000;
const FETCH_TIMEOUT_MS = 30000;
const FETCH_RETRIES = 3;

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const monthToYear = (month) => Number(String(month).slice(0, 4));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    for (const name of fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
      docs.push(...(readJson(path.join(dir, name)).documents ?? []));
    }
  }
  return new Map(docs.map((doc) => [doc.id, doc]));
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
  return registry.overrides.find((item) => item.runiversResourceId === resourceId
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
  const urls = [
    `${host}/api/resource/${id}/geojson`,
    `${host}/api/resource/${id}/feature/?srs=4326`,
  ];
  const errors = [];
  for (const url of urls) {
    try {
      const payload = await getJson(url);
      if (payload?.type === 'FeatureCollection' && Array.isArray(payload.features)) return payload;
      if (Array.isArray(payload)) {
        const features = payload.map((item) => item?.type === 'Feature' ? item : item?.geom
          ? {type: 'Feature', geometry: item.geom, properties: item.fields ?? item.properties ?? {}}
          : null).filter(Boolean);
        if (features.length) return {type: 'FeatureCollection', features};
      }
    } catch (error) {
      errors.push(`${url}: ${error?.message ?? error}`);
    }
  }
  throw new Error(`Runivers resource ${id} export failed: ${errors.join(' | ')}`);
}

function featureCollectionsFeatures(payload) {
  if (payload?.type === 'FeatureCollection') return payload.features ?? [];
  if (payload?.type === 'Feature') return [payload];
  if (payload?.type && payload.coordinates) return [{type: 'Feature', geometry: payload, properties: {}}];
  return [];
}

function geometryLines(geometry, polygonOuterOnly = true) {
  if (!geometry) return [];
  const {type, coordinates} = geometry;
  if (type === 'LineString') return [coordinates];
  if (type === 'MultiLineString') return coordinates;
  if (type === 'Polygon') return polygonOuterOnly ? (coordinates[0] ? [coordinates[0]] : []) : coordinates;
  if (type === 'MultiPolygon') return coordinates.flatMap((polygon) => polygonOuterOnly ? (polygon[0] ? [polygon[0]] : []) : polygon);
  if (type === 'GeometryCollection') return (geometry.geometries ?? []).flatMap((item) => geometryLines(item, polygonOuterOnly));
  return [];
}

function classifyGeometry(payload) {
  const types = new Set(featureCollectionsFeatures(payload).map((feature) => feature?.geometry?.type).filter(Boolean));
  const hasPolygon = [...types].some((type) => type === 'Polygon' || type === 'MultiPolygon');
  const hasLine = [...types].some((type) => type === 'LineString' || type === 'MultiLineString');
  return {types: [...types], hasPolygon, hasLine, usable: hasPolygon || hasLine};
}

function isReferenceApproximate(payload) {
  const propertyText = featureCollectionsFeatures(payload)
    .map((feature) => JSON.stringify(feature?.properties ?? {}))
    .join(' ')
    .toLowerCase();
  return /(приблиз|условн|неточн|approx|uncertain|reconstruct)/i.test(propertyText);
}

function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
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

function samplePayload(payload) {
  const points = [];
  for (const feature of featureCollectionsFeatures(payload)) {
    for (const line of geometryLines(feature?.geometry, true)) {
      for (let i = 0; i + 1 < line.length; i += 1) {
        const a = line[i];
        const b = line[i + 1];
        if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
        if (!Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(b[0]) || !Number.isFinite(b[1])) continue;
        const distance = haversineMeters(a, b);
        const steps = Math.max(1, Math.ceil(distance / SAMPLE_STEP_M));
        for (let step = 0; step < steps; step += 1) points.push(interpolateLonLat(a, b, step / steps));
      }
      const last = line[line.length - 1];
      if (Array.isArray(last) && last.length >= 2) points.push([last[0], last[1]]);
    }
  }
  if (points.length <= MAX_SAMPLES) return points;
  const stride = points.length / MAX_SAMPLES;
  return Array.from({length: MAX_SAMPLES}, (_, i) => points[Math.floor(i * stride)]);
}

function unitVector(point) {
  const rad = Math.PI / 180;
  const lon = point[0] * rad;
  const lat = point[1] * rad;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

function buildKdTree(points, depth = 0) {
  if (!points.length) return null;
  const axis = depth % 3;
  points.sort((a, b) => a.xyz[axis] - b.xyz[axis]);
  const mid = Math.floor(points.length / 2);
  return {
    point: points[mid], axis,
    left: buildKdTree(points.slice(0, mid), depth + 1),
    right: buildKdTree(points.slice(mid + 1), depth + 1),
  };
}

function nearestChordSquared(node, xyz, best = Infinity) {
  if (!node) return best;
  const dx = node.point.xyz[0] - xyz[0];
  const dy = node.point.xyz[1] - xyz[1];
  const dz = node.point.xyz[2] - xyz[2];
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 < best) best = d2;
  const delta = xyz[node.axis] - node.point.xyz[node.axis];
  const near = delta < 0 ? node.left : node.right;
  const far = delta < 0 ? node.right : node.left;
  best = nearestChordSquared(near, xyz, best);
  if (delta * delta < best) best = nearestChordSquared(far, xyz, best);
  return best;
}

function chordSquaredToMeters(d2) {
  const chord = Math.min(2, Math.sqrt(Math.max(0, d2)));
  return 2 * EARTH_RADIUS_M * Math.asin(chord / 2);
}

function directedDistances(sourcePoints, targetPoints) {
  if (!sourcePoints.length || !targetPoints.length) return [];
  const tree = buildKdTree(targetPoints.map((point) => ({point, xyz: unitVector(point)})));
  return sourcePoints.map((point) => chordSquaredToMeters(nearestChordSquared(tree, unitVector(point))));
}

function compareSampledGeometry(referencePoints, referenceClass, currentPoints) {
  if (!referencePoints.length || !currentPoints.length) return {usable: false, referenceSamples: referencePoints.length, currentSamples: currentPoints.length};
  const refToCurrent = directedDistances(referencePoints, currentPoints);
  const currentToRef = referenceClass.hasPolygon ? directedDistances(currentPoints, referencePoints) : [];
  const refP95 = percentile(refToCurrent, .95);
  const refMax = Math.max(...refToCurrent);
  const curP95 = currentToRef.length ? percentile(currentToRef, .95) : null;
  const curMax = currentToRef.length ? Math.max(...currentToRef) : null;
  return {
    usable: true,
    referenceSamples: referencePoints.length,
    currentSamples: currentPoints.length,
    referenceGeometryTypes: referenceClass.types,
    referenceToCurrentP95Meters: Math.round(refP95),
    referenceToCurrentMaxMeters: Math.round(refMax),
    currentToReferenceP95Meters: curP95 === null ? null : Math.round(curP95),
    currentToReferenceMaxMeters: curMax === null ? null : Math.round(curMax),
    symmetricP95Meters: Math.round(Math.max(refP95, curP95 ?? 0)),
    symmetricMaxMeters: Math.round(Math.max(refMax, curMax ?? 0)),
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
    if (month.month < START_MONTH || month.month > END_MONTH) continue;
    if (!month.geometryFile || month.status !== 'geometry-verified') continue;
    const key = month.geometryFile;
    const row = grouped.get(key) ?? {
      key,
      geometryFile: month.geometryFile,
      polityId: month.polityId,
      snapshotId: month.snapshotId ?? null,
      certificationId: month.certificationId ?? null,
      verificationClass: month.verificationClass ?? null,
      uncertaintyMeters: month.uncertaintyMeters ?? null,
      evidenceDocumentIds: month.evidenceDocumentIds ?? [],
      firstMonth: month.month,
      lastMonth: month.month,
      months: 0,
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

function referenceOverlapsState(layer, state) {
  if (!Number.isInteger(layer.fromYear) || !Number.isInteger(layer.toYear)) return false;
  const firstYear = monthToYear(state.firstMonth);
  const lastYear = monthToYear(state.lastMonth);
  return layer.fromYear <= lastYear && layer.toYear >= firstYear;
}

async function main() {
  if (!fs.existsSync(discoveryFile)) throw new Error(`Runivers discovery report missing: ${discoveryFile}`);
  if (!fs.existsSync(monthIndexFile)) throw new Error('History Core month index missing; run npm run materialize:history first');
  if (!fs.existsSync(overrideFile)) throw new Error('Runivers override registry missing');

  const discovery = readJson(discoveryFile);
  const monthIndex = readJson(monthIndexFile);
  const overrides = readJson(overrideFile);
  const documents = canonicalDocuments();
  validateOverrides(overrides, documents);

  const states = historyStates(monthIndex);
  const layers = (discovery.vectorLayers ?? [])
    .filter((layer) => Number.isInteger(layer.fromYear) && Number.isInteger(layer.toYear))
    .filter((layer) => layer.toYear >= 1462 && layer.fromYear <= 2020)
    .sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
  if (!states.length) throw new Error('No History Core geometry-verified states in 1462-2020');
  if (!layers.length) throw new Error('Runivers discovery found no dated vector layers overlapping 1462-2020');

  const relevantLayers = layers.filter((layer) => states.some((state) => referenceOverlapsState(layer, state)));
  const coverage = new Map(states.map((state) => [state.key, []]));
  const historySamplesCache = new Map();
  const comparisons = [];
  const referenceFailures = [];
  let usableReferenceCount = 0;

  // Runivers contains hundreds of large polygon resources. Process one dated
  // resource at a time and immediately discard its raw GeoJSON after sampling.
  // The previous all-at-once fetch retained every payload and exceeded the
  // GitHub runner's ~4 GB Node heap before any report could be produced.
  for (let index = 0; index < relevantLayers.length; index += 1) {
    const layer = relevantLayers[index];
    let geojson;
    try {
      geojson = await fetchRuniversGeoJson(discovery.host, layer.id);
    } catch (error) {
      referenceFailures.push({layer, error: error?.message ?? String(error)});
      continue;
    }

    const classification = classifyGeometry(geojson);
    if (!classification.usable) continue;
    usableReferenceCount += 1;
    const approximate = isReferenceApproximate(geojson);
    const referencePoints = samplePayload(geojson);
    geojson = null;
    if (!referencePoints.length) continue;

    const overlappingStates = states.filter((state) => referenceOverlapsState(layer, state));
    for (const state of overlappingStates) {
      let currentPoints = historySamplesCache.get(state.key);
      if (!currentPoints) {
        currentPoints = samplePayload(loadHistoryGeometry(state));
        historySamplesCache.set(state.key, currentPoints);
      }
      const metric = compareSampledGeometry(referencePoints, classification, currentPoints);
      if (!metric.usable) continue;
      const comparisonYear = Math.max(layer.fromYear, monthToYear(state.firstMonth));
      const tolerance = toleranceMeters(comparisonYear, approximate);
      const maxTolerance = tolerance * 4;
      const override = overrideFor(overrides, state, layer.id);
      const passMetric = metric.symmetricP95Meters <= tolerance && metric.symmetricMaxMeters <= maxTolerance;
      const status = passMetric ? 'pass' : override ? 'override' : 'fail';
      const row = {
        status,
        runiversResourceId: layer.id,
        runiversName: layer.displayName,
        runiversFromYear: layer.fromYear,
        runiversToYear: layer.toYear,
        runiversApproximate: approximate,
        historyGeometryFile: state.geometryFile,
        polityId: state.polityId,
        snapshotId: state.snapshotId,
        certificationId: state.certificationId,
        historyFirstMonth: state.firstMonth,
        historyLastMonth: state.lastMonth,
        historyVerificationClass: state.verificationClass,
        historyUncertaintyMeters: state.uncertaintyMeters,
        toleranceMeters: tolerance,
        maxToleranceMeters: maxTolerance,
        ...metric,
        overrideId: override?.id ?? null,
      };
      comparisons.push(row);
      coverage.get(state.key).push(row);
    }

    if ((index + 1) % 20 === 0 || index + 1 === relevantLayers.length) {
      console.log(`Runivers regression progress: ${index + 1}/${relevantLayers.length} dated layers; ${comparisons.length} comparisons.`);
    }
  }

  const stateCoverage = states.map((state) => {
    const rows = coverage.get(state.key) ?? [];
    return {
      ...state,
      referenceComparisons: rows.length,
      passes: rows.filter((row) => row.status === 'pass').length,
      overrides: rows.filter((row) => row.status === 'override').length,
      failures: rows.filter((row) => row.status === 'fail').length,
    };
  });
  const missingStates = stateCoverage.filter((state) => state.referenceComparisons === 0);
  const failedComparisons = comparisons.filter((row) => row.status === 'fail');
  const stateCoverageByGeometry = new Map(stateCoverage.map((state) => [state.geometryFile, state]));
  const uncoveredMonths = [];
  for (const month of monthIndex.months ?? []) {
    if (month.month < START_MONTH || month.month > END_MONTH || month.status !== 'geometry-verified') continue;
    const state = stateCoverageByGeometry.get(month.geometryFile);
    if (!state || state.referenceComparisons === 0) uncoveredMonths.push(month.month);
  }

  const report = {
    schema_version: 1,
    generatedAt: new Date().toISOString(),
    policy: {
      baseline: 'Runivers / Institute of World History RAS / NextGIS — Границы России и предшественников',
      range: `${START_MONTH}..${END_MONTH}`,
      rule: 'Every canonical Russian state must be cross-checked against an overlapping dated Runivers vector. Deviations beyond the reference tolerance require an A1/A2/A3 documentary override.',
      sampleStepMeters: SAMPLE_STEP_M,
    },
    discovery: {
      host: discovery.host,
      schemaVersion: discovery.schemaVersion,
      vectorLayerCount: discovery.vectorLayerCount,
      datedLayerCount: layers.length,
      usableReferenceCount,
      referenceExportFailures: referenceFailures,
    },
    historyStateCount: states.length,
    comparisonCount: comparisons.length,
    passCount: comparisons.filter((row) => row.status === 'pass').length,
    overrideCount: comparisons.filter((row) => row.status === 'override').length,
    failureCount: failedComparisons.length,
    missingStateCount: missingStates.length,
    uncoveredMonthCount: uncoveredMonths.length,
    missingStates,
    uncoveredMonths,
    failedComparisons,
    stateCoverage,
    comparisons,
  };

  fs.mkdirSync(reportDir, {recursive: true});
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log(`Runivers regression: ${states.length} History Core states, ${usableReferenceCount} usable dated reference layers, ${comparisons.length} comparisons.`);
  console.log(`Pass=${report.passCount}; override=${report.overrideCount}; fail=${report.failureCount}; missing states=${report.missingStateCount}; uncovered months=${report.uncoveredMonthCount}.`);
  if (referenceFailures.length) console.log(`Reference export failures: ${referenceFailures.length}`);
  for (const row of failedComparisons.slice(0, 30)) {
    console.log(`FAIL Runivers ${row.runiversResourceId} ${row.runiversName} vs ${row.historyGeometryFile}: p95=${Math.round(row.symmetricP95Meters / 1000)}km max=${Math.round(row.symmetricMaxMeters / 1000)}km tolerance=${Math.round(row.toleranceMeters / 1000)}km`);
  }
  for (const state of missingStates.slice(0, 30)) console.log(`MISSING ${state.firstMonth}..${state.lastMonth} ${state.polityId} ${state.geometryFile}`);
  console.log(`Report written to ${reportFile}`);

  if (referenceFailures.length) throw new Error(`${referenceFailures.length} dated Runivers reference layer(s) could not be exported`);
  if (missingStates.length) throw new Error(`${missingStates.length} History Core state(s) have no Runivers geometric comparison`);
  if (failedComparisons.length) throw new Error(`${failedComparisons.length} Runivers geometric regression comparison(s) exceed tolerance without evidence-backed override`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
