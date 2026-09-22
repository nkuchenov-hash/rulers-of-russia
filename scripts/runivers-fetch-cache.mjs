import fs from 'node:fs';
import path from 'node:path';

// Preload the public Runivers GeoJSON exports with bounded concurrency while the
// regression validator processes them in chronological order. The validator's
// geometry metrics and acceptance thresholds remain unchanged; this only removes
// serial network latency that otherwise exceeds the GitHub Actions time budget.

const root = process.cwd();
const discoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-discovery.json');
const cacheDir = path.join(root, 'tmp', 'runivers-regression', 'reference-cache');
const concurrency = Math.max(1, Math.min(8, Number(process.env.RUNIVERS_FETCH_CONCURRENCY || 6)));
const originalFetch = globalThis.fetch.bind(globalThis);

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

async function fetchTextWithRetry(url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await originalFetch(url, {
        signal: controller.signal,
        headers: {accept: 'application/json,*/*'},
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      const parsed = JSON.parse(body);
      if (parsed?.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
        throw new Error('not a GeoJSON FeatureCollection');
      }
      return body;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`Unable to prefetch ${url}`);
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
        const body = await fetchTextWithRetry(`${host}/api/resource/${id}/geojson`);
        fs.writeFileSync(file, body);
        return {file};
      }).catch((error) => ({error})));
    }

    globalThis.fetch = async function runiversCachedFetch(input, init) {
      const url = requestUrl(input);
      const match = url.match(/\/api\/resource\/(\d+)\/geojson(?:\?|$)/);
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
        }
      }
      return originalFetch(input, init);
    };

    console.log(`Runivers concurrent prefetch enabled: ${ids.length} layers, concurrency ${concurrency}.`);
  }
}
