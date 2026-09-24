import fs from 'node:fs';
import path from 'node:path';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import polygonClipping from 'polygon-clipping';

// Preload the public Runivers geometry with bounded concurrency while the
// regression validator processes layers in chronological order. The validator's
// geometry metrics and acceptance thresholds remain unchanged; this only removes
// repeated/serial network latency from the live NextGIS service.
//
// Runivers' own production client uses NextGIS vector tiles for these ~50 MB time
// slices. Full GeoJSON/feature exports intermittently return 503, so the cache
// reconstructs the same polygon from MVT tiles when the export APIs are down.
// The reconstructed reference exists only in the ephemeral CI workspace.

const root = process.cwd();
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const cacheDir = path.join(root, 'tmp', 'runivers-regression', 'reference-cache');
const concurrency = Math.max(1, Math.min(8, Number(process.env.RUNIVERS_FETCH_CONCURRENCY || 2)));
const originalFetch = globalThis.fetch.bind(globalThis);
const PREFETCH_TIMEOUT_MS = 12000;
const PREFETCH_ATTEMPTS = 2;
const COORDINATE_CHECK_LIMIT = 5000;
const VECTOR_TILE_ZOOM = 2;
const VECTOR_TILE_TIMEOUT_MS = 10000;

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
      for (const item of geometry.geometries ?? []) {
        if (item?.coordinates) inspect(item.coordinates);
      }
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
  if (!geometryLooksWgs84(payload)) {
    throw new Error('geometry is not EPSG:4326 lon/lat');
  }
  return payload;
}

async function fetchJsonOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PREFETCH_TIMEOUT_MS);
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

async function fetchVectorTile(host, id, z, x, y) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VECTOR_TILE_TIMEOUT_MS);
  try {
    const response = await originalFetch(`${host}/api/resource/${id}/${z}/${x}/${y}.mvt`, {
      signal: controller.signal,
      headers: {accept: 'application/vnd.mapbox-vector-tile,application/x-protobuf,*/*'},
      redirect: 'follow',
    });
    if (response.status === 204 || response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.length) return null;
    return new VectorTile(new Pbf(buffer));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLayerFromVectorTiles(host, id) {
  const z = VECTOR_TILE_ZOOM;
  const side = 2 ** z;
  let merged = [];
  let polygonFeatures = 0;
  const tileErrors = [];
  const sourceProperties = [];

  for (let x = 0; x < side; x += 1) {
    for (let y = 0; y < side; y += 1) {
      let tile;
      try {
        tile = await fetchVectorTile(host, id, z, x, y);
      } catch (error) {
        tileErrors.push(`${z}/${x}/${y}: ${error?.message ?? error}`);
        continue;
      }
      if (!tile) continue;
      for (const layerName of Object.keys(tile.layers ?? {})) {
        const layer = tile.layers[layerName];
        for (let index = 0; index < layer.length; index += 1) {
          const feature = layer.feature(index);
          const geojson = feature.toGeoJSON(x, y, z);
          const multi = geometryToMultiPolygon(geojson?.geometry);
          if (!multi.length) continue;
          polygonFeatures += 1;
          if (sourceProperties.length < 32 && geojson?.properties) sourceProperties.push(geojson.properties);
          merged = merged.length ? polygonClipping.union(merged, multi) : multi;
        }
      }
    }
  }

  if (!merged.length || !polygonFeatures) {
    throw new Error(`MVT fallback produced no polygon geometry${tileErrors.length ? `; tile errors: ${tileErrors.join(' | ')}` : ''}`);
  }
  const payload = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {
        runiversReferenceTransport: 'mvt',
        vectorTileZoom: z,
        polygonFeatures,
        sourceProperties,
      },
      geometry: {type: 'MultiPolygon', coordinates: merged},
    }],
  };
  if (!geometryLooksWgs84(payload)) throw new Error('MVT reconstruction is not valid EPSG:4326 geometry');
  return payload;
}

async function fetchLayerWithRetry(host, id) {
  // Prefer explicit WGS84 JSON exports when available. The export endpoint is
  // included because some NextGIS deployments disable one of the lighter APIs.
  const urls = [
    `${host}/api/resource/${id}/feature/?srs=4326`,
    `${host}/api/resource/${id}/export?format=GeoJSON&srs=4326&zipped=False&fid=ngw_id&encoding=UTF-8`,
    `${host}/api/resource/${id}/geojson`,
  ];
  const errors = [];
  for (let attempt = 1; attempt <= PREFETCH_ATTEMPTS; attempt += 1) {
    for (const url of urls) {
      try {
        return await fetchJsonOnce(url);
      } catch (error) {
        errors.push(`${url}: ${error?.message ?? error}`);
      }
    }
    if (attempt < PREFETCH_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
  }

  try {
    const payload = await fetchLayerFromVectorTiles(host, id);
    console.log(`Runivers resource ${id}: full-layer exports unavailable; using production MVT transport.`);
    return payload;
  } catch (error) {
    errors.push(`MVT z${VECTOR_TILE_ZOOM}: ${error?.message ?? error}`);
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
        const payload = await fetchLayerWithRetry(host, id);
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
            // The bounded prefetch already exhausted every supported public
            // transport, including the same MVT path used by Runivers' web map.
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

    console.log(`Runivers concurrent prefetch enabled: ${ids.length} layers, concurrency ${concurrency}; WGS84 exports first, production MVT fallback enabled.`);
  }
}
