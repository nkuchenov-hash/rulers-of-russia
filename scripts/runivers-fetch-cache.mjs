import fs from 'node:fs';
import path from 'node:path';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import polygonClipping from 'polygon-clipping';

// Preload Runivers reference geometry with bounded concurrency. Runivers serves
// its large historical polygons through NextGIS MVT in production; full-layer
// JSON exports are only a fallback because they frequently return 503.
//
// IMPORTANT: use the single z=0 world tile. Reassembling a layer from many MVT
// tiles introduces clipping seams at tile edges; those seams are rendering
// artifacts, not political borders, and must never enter the regression metric.
// simplification=0 disables NextGIS' optional extra geometry simplification.
// Reference geometry remains ephemeral in CI and is never committed to the repo.

const root = process.cwd();
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const cacheDir = path.join(root, 'tmp', 'runivers-regression', 'reference-cache');
const concurrency = Math.max(1, Math.min(8, Number(process.env.RUNIVERS_FETCH_CONCURRENCY || 2)));
const originalFetch = globalThis.fetch.bind(globalThis);
const JSON_TIMEOUT_MS = 12000;
const JSON_ATTEMPTS = 1;
const COORDINATE_CHECK_LIMIT = 5000;
const VECTOR_TILE_ZOOM = 0;
const VECTOR_TILE_TIMEOUT_MS = 15000;

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? '';
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < max && queue.length) {
      const item = queue.shift();
      active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({task, resolve, reject});
    pump();
  });
}

function geometryLooksWgs84(payload) {
  let checked = 0;
  let invalid = false;
  const inspect = (value) => {
    if (invalid || checked >= COORDINATE_CHECK_LIMIT || !Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      checked += 1;
      const lon = Number(value[0]);
      const lat = Number(value[1]);
      if (Math.abs(lon) > 180.000001 || Math.abs(lat) > 90.000001) invalid = true;
      return;
    }
    for (const child of value) inspect(child);
  };
  for (const feature of payload?.features ?? []) {
    if (checked >= COORDINATE_CHECK_LIMIT || invalid) break;
    const geometry = feature?.geometry;
    if (geometry?.coordinates) inspect(geometry.coordinates);
    if (geometry?.type === 'GeometryCollection') {
      for (const item of geometry.geometries ?? []) if (item?.coordinates) inspect(item.coordinates);
    }
  }
  return checked > 0 && !invalid;
}

function normalizePayload(parsed) {
  let payload = null;
  if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    payload = parsed;
  } else if (Array.isArray(parsed)) {
    const features = parsed.map((item) => item?.type === 'Feature' ? item : item?.geom
      ? {type: 'Feature', geometry: item.geom, properties: item.fields ?? item.properties ?? {}}
      : null).filter(Boolean);
    if (features.length) payload = {type: 'FeatureCollection', features};
  }
  if (!payload) throw new Error('response has no usable feature geometry');
  if (!geometryLooksWgs84(payload)) throw new Error('geometry is not EPSG:4326 lon/lat');
  return payload;
}

async function fetchJsonOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JSON_TIMEOUT_MS);
  try {
    const response = await originalFetch(url, {
      signal: controller.signal,
      headers: {accept: 'application/json,*/*'},
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return normalizePayload(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

function geometryToMultiPolygon(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

async function fetchVectorTile(host, id) {
  const z = VECTOR_TILE_ZOOM;
  const x = 0;
  const y = 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VECTOR_TILE_TIMEOUT_MS);
  try {
    const tileUrl = new URL('/api/component/feature_layer/mvt', `${host}/`);
    tileUrl.searchParams.set('resource', String(id));
    tileUrl.searchParams.set('z', String(z));
    tileUrl.searchParams.set('x', String(x));
    tileUrl.searchParams.set('y', String(y));
    tileUrl.searchParams.set('simplification', '0');
    const response = await originalFetch(tileUrl, {
      signal: controller.signal,
      headers: {accept: 'application/vnd.mapbox-vector-tile,application/x-protobuf,*/*'},
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('empty vector tile');
    return new VectorTile(new Pbf(bytes));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLayerFromVectorTile(host, id) {
  const tile = await fetchVectorTile(host, id);
  let merged = [];
  let polygonFeatures = 0;
  const sourceProperties = [];

  for (const layerName of Object.keys(tile.layers ?? {})) {
    const layer = tile.layers[layerName];
    for (let index = 0; index < layer.length; index += 1) {
      const feature = layer.feature(index);
      const geojson = feature.toGeoJSON(0, 0, VECTOR_TILE_ZOOM);
      const multi = geometryToMultiPolygon(geojson?.geometry);
      if (!multi.length) continue;
      polygonFeatures += 1;
      if (sourceProperties.length < 32 && geojson?.properties) sourceProperties.push(geojson.properties);
      merged = merged.length ? polygonClipping.union(merged, multi) : multi;
    }
  }

  if (!merged.length || !polygonFeatures) throw new Error('z=0 MVT produced no polygon geometry');
  const payload = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        runiversReferenceTransport: 'mvt-current-api-single-world-tile',
        vectorTileZoom: VECTOR_TILE_ZOOM,
        vectorTileSimplification: 0,
        polygonFeatures,
        sourceProperties,
      },
      geometry: {type: 'MultiPolygon', coordinates: merged},
    }],
  };
  if (!geometryLooksWgs84(payload)) throw new Error('MVT reconstruction is not valid EPSG:4326 geometry');
  return payload;
}

async function fetchLayer(host, id) {
  const errors = [];
  try {
    const payload = await fetchLayerFromVectorTile(host, id);
    console.log(`Runivers resource ${id}: using seam-free z=0 current NextGIS MVT reference.`);
    return payload;
  } catch (error) {
    errors.push(`MVT z0: ${error?.message ?? error}`);
  }

  const urls = [
    `${host}/api/resource/${id}/feature/?srs=4326`,
    `${host}/api/resource/${id}/export?format=GeoJSON&srs=4326&zipped=False&fid=ngw_id&encoding=UTF-8`,
    `${host}/api/resource/${id}/geojson`,
  ];
  for (let attempt = 1; attempt <= JSON_ATTEMPTS; attempt += 1) {
    for (const url of urls) {
      try {
        const payload = await fetchJsonOnce(url);
        console.log(`Runivers resource ${id}: MVT unavailable; using WGS84 JSON export.`);
        return payload;
      } catch (error) {
        errors.push(`${url}: ${error?.message ?? error}`);
      }
    }
  }
  throw new Error(`Runivers resource ${id} prefetch failed: ${errors.join(' | ')}`);
}

if (fs.existsSync(discoveryFile)) {
  const discovery = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
  const host = String(discovery.host || '').replace(/\/$/, '');
  const ids = [...new Set((discovery.vectorLayers ?? [])
    .filter((layer) => Number.isInteger(layer.fromYear) && Number.isInteger(layer.toYear))
    .filter((layer) => layer.toYear >= 1462 && layer.fromYear <= 2020)
    .map((layer) => Number(layer.id))
    .filter(Number.isInteger))];

  if (host && ids.length) {
    fs.mkdirSync(cacheDir, {recursive: true});
    const limit = limiter(concurrency);
    const prefetched = new Map();
    for (const id of ids) {
      const file = path.join(cacheDir, `${id}.geojson`);
      prefetched.set(id, limit(async () => {
        if (fs.existsSync(file)) return {file};
        const payload = await fetchLayer(host, id);
        fs.writeFileSync(file, JSON.stringify(payload));
        return {file};
      }).catch((error) => ({error})));
    }

    globalThis.fetch = async function runiversCachedFetch(input, init) {
      const url = requestUrl(input);
      const match = url.match(/\/api\/resource\/(\d+)\/(?:geojson|feature\/)(?:\?|$)/);
      if (match) {
        const id = Number(match[1]);
        const pending = prefetched.get(id);
        if (pending) {
          const cached = await pending;
          if (!cached.error && cached.file && fs.existsSync(cached.file)) {
            if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
            return new Response(fs.readFileSync(cached.file), {
              status: 200,
              headers: {'content-type': 'application/geo+json'},
            });
          }
          if (cached.error) {
            return new Response(JSON.stringify({
              error: 'runivers-prefetch-exhausted',
              resourceId: id,
              detail: String(cached.error?.message ?? cached.error),
            }), {
              status: 503,
              headers: {'content-type': 'application/json'},
            });
          }
        }
      }
      return originalFetch(input, init);
    };

    console.log(`Runivers prefetch enabled: ${ids.length} layers, concurrency ${concurrency}; seam-free z=0 NextGIS MVT first, WGS84 JSON fallback.`);
  }
}
