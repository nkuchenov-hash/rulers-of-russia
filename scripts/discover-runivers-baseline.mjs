import fs from 'node:fs';
import path from 'node:path';

const hosts = ['https://gis.runivers.ru', 'http://gis.runivers.ru'];
const seedResourceId = 5455;
const expectedRootName = 'Границы';
const timeoutMs = 45000;
const maxResources = 20000;
const historicalPolygonRe = /from[_\s-]*(\d{3,4})[_\s-]*to[_\s-]*(\d{3,4}).*\bPolygon\b/i;

async function getJson(url, timeout = timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {'accept': 'application/json,*/*'},
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function retryJson(url, attempts = 4) {
  const errors = [];
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await getJson(url, timeoutMs + i * 15000);
    } catch (error) {
      errors.push(error?.message ?? String(error));
      if (i + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 1200 * (i + 1)));
    }
  }
  throw new Error(`${url}: ${errors.join(' | ')}`);
}

async function findHost() {
  const errors = [];
  for (const host of hosts) {
    try {
      const resource = await getJson(`${host}/api/resource/${seedResourceId}`);
      return {host, resource};
    } catch (error) {
      errors.push(`${host}: ${error?.message ?? error}`);
    }
  }
  throw new Error(`Runivers NextGIS API is unavailable from CI. ${errors.join(' | ')}`);
}

function rawResource(item) {
  return item?.resource ?? item ?? {};
}
function parentId(resource) {
  return rawResource(resource)?.parent?.id ?? null;
}
function ancestorIds(resource) {
  const ids = [];
  let cursor = rawResource(resource)?.parent ?? null;
  const seen = new Set();
  while (cursor && Number.isInteger(cursor.id) && !seen.has(cursor.id)) {
    ids.push(cursor.id);
    seen.add(cursor.id);
    cursor = cursor.parent ?? null;
  }
  return ids;
}
function resourceSummary(item) {
  const resource = rawResource(item);
  return {
    id: resource.id ?? null,
    cls: resource.cls ?? null,
    displayName: resource.display_name ?? null,
    keyname: resource.keyname ?? null,
    parentId: resource.parent?.id ?? null,
    ancestorIds: ancestorIds(resource),
    children: resource.children ?? null,
  };
}
async function listChildren(host, id) {
  const data = await retryJson(`${host}/api/resource/?parent=${id}`);
  if (!Array.isArray(data)) throw new Error(`Unexpected child listing for ${id}`);
  return data;
}
async function walkParents(host, resource) {
  const chain = [resourceSummary(resource)];
  let current = resource;
  const seen = new Set([seedResourceId]);
  for (let depth = 0; depth < 10; depth += 1) {
    const id = parentId(current);
    if (!Number.isInteger(id) || id === 0 || seen.has(id)) break;
    seen.add(id);
    current = await getJson(`${host}/api/resource/${id}`);
    chain.push(resourceSummary(current));
  }
  return chain;
}

function intervalFromName(value) {
  const match = String(value ?? '').match(historicalPolygonRe);
  if (!match) return {fromYear: null, toYear: null, historicalPolygon: false};
  return {fromYear: Number(match[1]), toYear: Number(match[2]), historicalPolygon: true};
}

async function searchVectorLayers(host) {
  const urls = [
    `${host}/api/resource/search/?cls=vector_layer&serialization=full`,
    `${host}/api/resource/search/?cls=vector_layer`,
  ];
  const attempts = [];
  for (const url of urls) {
    try {
      const data = await retryJson(url, 2);
      const rows = Array.isArray(data) ? data : Array.isArray(data?.resources) ? data.resources : null;
      if (!rows) throw new Error('response is not a resource array');
      const vectors = rows.filter((item) => rawResource(item).cls === 'vector_layer');
      attempts.push({url, ok: true, total: rows.length, vectors: vectors.length});
      if (vectors.length) return {ok: true, url, vectors, attempts};
    } catch (error) {
      attempts.push({url, ok: false, error: error?.message ?? String(error)});
    }
  }
  return {ok: false, attempts};
}

async function crawlTree(host, rootId) {
  const resources = [];
  const errors = [];
  const queue = [{id: rootId, path: expectedRootName}];
  const visitedParents = new Set();

  while (queue.length) {
    const batch = queue.splice(0, 24);
    const results = await Promise.all(batch.map(async (node) => {
      if (visitedParents.has(node.id)) return {node, children: []};
      visitedParents.add(node.id);
      try {
        return {node, children: await listChildren(host, node.id)};
      } catch (error) {
        errors.push({parentId: node.id, path: node.path, error: error?.message ?? String(error)});
        return {node, children: []};
      }
    }));

    for (const {node, children} of results) {
      for (const child of children) {
        const summary = resourceSummary(child);
        const childPath = `${node.path}/${summary.displayName ?? summary.id}`;
        const interval = intervalFromName(`${summary.displayName ?? ''} ${summary.keyname ?? ''}`);
        resources.push({...summary, ...interval, path: childPath});
        if (summary.children === true || summary.cls === 'resource_group') queue.push({id: summary.id, path: childPath});
        if (resources.length > maxResources) throw new Error(`Runivers resource tree exceeded safety limit ${maxResources}`);
      }
    }
  }

  return {resources, errors};
}

async function probeGeoJson(host, resourceId) {
  const candidates = [
    `${host}/api/resource/${resourceId}/geojson`,
    `${host}/api/resource/${resourceId}/feature/?srs=4326&limit=2`,
  ];
  const attempts = [];
  for (const url of candidates) {
    try {
      const payload = await getJson(url);
      const features = Array.isArray(payload?.features) ? payload.features : Array.isArray(payload) ? payload : null;
      const featureCount = features?.length ?? null;
      attempts.push({url, ok: true, type: payload?.type ?? null, featureCount});
      if (payload?.type === 'FeatureCollection' || Array.isArray(features)) {
        return {ok: true, endpoint: url, featureCount, sample: features?.slice?.(0, 1) ?? []};
      }
    } catch (error) {
      attempts.push({url, ok: false, error: error?.message ?? String(error)});
    }
  }
  return {ok: false, attempts};
}

function summarizeVectors(items) {
  return items.map((item) => {
    const summary = resourceSummary(item);
    return {...summary, ...intervalFromName(`${summary.displayName ?? ''} ${summary.keyname ?? ''}`)};
  });
}

function baselineRange(layers) {
  if (!layers.length) return {minYear: null, maxYear: null};
  return {
    minYear: Math.min(...layers.map((item) => item.fromYear)),
    maxYear: Math.max(...layers.map((item) => item.toYear)),
  };
}

async function main() {
  const {host, resource} = await findHost();
  const parents = await walkParents(host, resource);
  const root = parents.find((item) => item.displayName === expectedRootName) ?? parents[parents.length - 1];
  const preferredParent = parents[1] ?? null;
  if (!Number.isInteger(root?.id)) throw new Error('Could not locate Runivers boundary root resource');
  if (!Number.isInteger(preferredParent?.id)) throw new Error('Could not locate current Runivers dated-layer parent from the known live seed resource');

  // The accepted baseline is defined by the direct parent of a known live
  // current Runivers boundary layer. Query that exact collection first. The
  // former implementation performed an expensive global resource search before
  // reaching the same parent, making CI depend on unrelated GIS catalogue size.
  let preferredChildren = [];
  let preferredParentError = null;
  try {
    preferredChildren = await listChildren(host, preferredParent.id);
  } catch (error) {
    preferredParentError = error?.message ?? String(error);
  }
  let preferredVectors = summarizeVectors(preferredChildren.filter((item) => rawResource(item).cls === 'vector_layer'));
  let preferredPolygonLayers = preferredVectors
    .filter((item) => item.historicalPolygon)
    .sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
  let {minYear: preferredMinYear, maxYear: preferredMaxYear} = baselineRange(preferredPolygonLayers);

  let vectors = preferredVectors;
  let resources = [];
  let crawlErrors = [];
  let searchAttempts = [];
  let discoveryMode = 'preferred-parent';

  // Only fall back to the global catalogue/tree when the canonical direct
  // parent cannot be enumerated or no longer exposes the expected date range.
  // This is diagnostic recovery, not a way to silently select another baseline.
  const needsFallbackDiscovery = Boolean(preferredParentError)
    || !preferredPolygonLayers.length
    || preferredMinYear > 1462
    || preferredMaxYear < 2018;

  if (needsFallbackDiscovery) {
    discoveryMode = 'preferred-parent-with-global-diagnostic';
    const searched = await searchVectorLayers(host);
    searchAttempts = searched.attempts;
    if (searched.ok) {
      vectors = summarizeVectors(searched.vectors).filter((item) =>
        item.ancestorIds.includes(root.id) || item.parentId === root.id || item.parentId === preferredParent.id);
    }
    if (!vectors.length || vectors === preferredVectors) {
      const crawled = await crawlTree(host, root.id);
      resources = crawled.resources;
      crawlErrors = crawled.errors;
      vectors = resources.filter((item) => item.cls === 'vector_layer');
    }
  }

  // Re-read the direct parent after diagnostic discovery if the first request
  // failed transiently. The baseline itself is never substituted from global
  // search results.
  if (preferredParentError) {
    try {
      preferredChildren = await listChildren(host, preferredParent.id);
      preferredParentError = null;
      preferredVectors = summarizeVectors(preferredChildren.filter((item) => rawResource(item).cls === 'vector_layer'));
      preferredPolygonLayers = preferredVectors
        .filter((item) => item.historicalPolygon)
        .sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
      ({minYear: preferredMinYear, maxYear: preferredMaxYear} = baselineRange(preferredPolygonLayers));
    } catch (error) {
      preferredParentError = error?.message ?? String(error);
    }
  }

  const allHistoricalPolygons = vectors
    .filter((item) => item.historicalPolygon)
    .sort((a, b) => a.fromYear - b.fromYear || a.toYear - b.toYear || a.id - b.id);
  const seedGeoJson = await probeGeoJson(host, seedResourceId);

  const output = {
    schemaVersion: 5,
    discoveredAt: new Date().toISOString(),
    host,
    root,
    seedResource: resourceSummary(resource),
    parentChain: parents,
    preferredParent,
    discoveryMode,
    searchAttempts,
    preferredParentError,
    resourceCount: resources.length || null,
    vectorLayerCount: vectors.length,
    historicalPolygonLayerCount: allHistoricalPolygons.length,
    preferredPolygonLayerCount: preferredPolygonLayers.length,
    preferredMinYear,
    preferredMaxYear,
    crawlErrors,
    seedGeoJson,
    preferredPolygonLayers,
    vectorLayers: vectors,
  };

  const outDir = path.join(process.cwd(), 'tmp', 'runivers-discovery');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, 'runivers-discovery.json');
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n');

  console.log(`Runivers host: ${host}`);
  console.log(`Boundary root: ${root.id}:${root.displayName}`);
  console.log(`Current baseline parent: ${preferredParent.id}:${preferredParent.displayName}`);
  console.log(`Discovery mode: ${discoveryMode}; search attempts: ${JSON.stringify(searchAttempts)}`);
  console.log(`All historical polygon layers discovered: ${allHistoricalPolygons.length}`);
  console.log(`Current baseline polygon layers: ${preferredPolygonLayers.length}; range: ${preferredMinYear}..${preferredMaxYear}`);
  console.log(`Seed GeoJSON probe: ${JSON.stringify(seedGeoJson.ok ? {ok: true, endpoint: seedGeoJson.endpoint, featureCount: seedGeoJson.featureCount} : seedGeoJson)}`);
  for (const item of preferredPolygonLayers.slice(0, 180)) {
    console.log(`BASELINE\t${item.fromYear}-${item.toYear}\t${item.id}\t${item.displayName}`);
  }
  if (preferredParentError) console.log(`Preferred parent fetch error: ${preferredParentError}`);
  if (crawlErrors.length) console.log(`Fallback crawl errors: ${JSON.stringify(crawlErrors.slice(0, 20))}`);
  console.log(`Discovery written to ${outFile}`);

  if (!seedGeoJson.ok) throw new Error('Runivers vector layer is discoverable but no supported GeoJSON/feature export endpoint was found');
  if (preferredParentError) throw new Error(`Current Runivers baseline parent ${preferredParent.id} could not be enumerated: ${preferredParentError}`);
  if (!preferredPolygonLayers.length) throw new Error(`Current Runivers baseline parent ${preferredParent.id} contains no dated historical polygon layers`);
  if (preferredMinYear > 1462) throw new Error(`Current Runivers baseline starts at ${preferredMinYear}; expected coverage by 1462`);
  if (preferredMaxYear < 2018) throw new Error(`Current Runivers baseline ends at ${preferredMaxYear}; expected coverage through at least 2018`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
