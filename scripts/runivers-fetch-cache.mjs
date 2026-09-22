import fs from 'node:fs';
import path from 'node:path';

// Preload the public Runivers geometry with bounded concurrency while the
// regression validator processes layers in chronological order. The validator's
// geometry metrics and acceptance thresholds remain unchanged; this only removes
// repeated/serial network latency from the live NextGIS service.

const root = process.cwd();
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const cacheDir = path.join(root, 'tmp', 'runivers-regression', 'reference-cache');
const concurrency = Math.max(1, Math.min(8, Number(process.env.RUNIVERS_FETCH_CONCURRENCY || 2)));
const originalFetch = globalThis.fetch.bind(globalThis);
const PREFETCH_TIMEOUT_MS = 12000;
const PREFETCH_ATTEMPTS = 2;
const COORDINATE_CHECK_LIMIT = 5000;

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

async function fetchLayerWithRetry(host, id) {
  // NextGIS /geojson may use the layer's native projected CRS. Prefer the
  // feature endpoint with an explicit WGS84 request and accept /geojson only
  // when its coordinate range proves that it is already lon/lat.
  const urls = [
    `${host}/api/resource/${id}/feature/?srs=4326`,
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
            // The bounded prefetch already exhausted both public export routes.
            // Return a deterministic failure so the validator records the
            // reference outage instead of repeating another network retry loop.
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

    console.log(`Runivers concurrent prefetch enabled: ${ids.length} layers, concurrency ${concurrency}; WGS84 feature endpoint first, coordinate-range validation enabled.`);
  }
}
