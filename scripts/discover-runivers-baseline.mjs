import fs from 'node:fs';
import path from 'node:path';

const hosts = ['https://gis.runivers.ru', 'http://gis.runivers.ru'];
const seedResourceId = 5455;
const expectedRootName = 'Границы';
const timeoutMs = 30000;
const maxResources = 20000;

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
function resourceSummary(item) {
  const resource = rawResource(item);
  return {
    id: resource.id ?? null,
    cls: resource.cls ?? null,
    displayName: resource.display_name ?? null,
    keyname: resource.keyname ?? null,
    parentId: resource.parent?.id ?? null,
    children: resource.children ?? null,
  };
}
async function listChildren(host, id) {
  const data = await getJson(`${host}/api/resource/?parent=${id}`);
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

function yearsFromText(value) {
  return [...String(value ?? '').matchAll(/(?:^|\D)(8\d{2}|9\d{2}|1\d{3}|20[0-2]\d)(?=\D|$)/g)].map((match) => Number(match[1]));
}
function intervalFromName(value) {
  const text = String(value ?? '');
  const explicit = text.match(/from[_\s-]*(\d{3,4})[_\s-]*to[_\s-]*(\d{3,4})/i);
  if (explicit) return {fromYear: Number(explicit[1]), toYear: Number(explicit[2])};
  const years = yearsFromText(text);
  if (years.length >= 2) return {fromYear: years[0], toYear: years[1]};
  if (years.length === 1) return {fromYear: years[0], toYear: years[0]};
  return {fromYear: null, toYear: null};
}

async function crawlTree(host, rootId) {
  const resources = [];
  const errors = [];
  const queue = [{id: rootId, path: expectedRootName}];
  const visitedParents = new Set();

  while (queue.length) {
    const batch = queue.splice(0, 8);
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
    `${host}/api/resource/${resourceId}/feature/?limit=2`,
  ];
  const attempts = [];
  for (const url of candidates) {
    try {
      const payload = await getJson(url);
      const featureCount = Array.isArray(payload?.features) ? payload.features.length
        : Array.isArray(payload) ? payload.length
          : null;
      attempts.push({url, ok: true, type: payload?.type ?? null, featureCount});
      if (payload?.type === 'FeatureCollection' || Array.isArray(payload?.features)) {
        return {ok: true, endpoint: url, featureCount, sample: payload.features?.slice?.(0, 1) ?? []};
      }
    } catch (error) {
      attempts.push({url, ok: false, error: error?.message ?? String(error)});
    }
  }
  return {ok: false, attempts};
}

async function main() {
  const {host, resource} = await findHost();
  const parents = await walkParents(host, resource);
  const root = parents.find((item) => item.displayName === expectedRootName) ?? parents[parents.length - 1];
  if (!Number.isInteger(root?.id)) throw new Error('Could not locate Runivers boundary root resource');

  const {resources, errors} = await crawlTree(host, root.id);
  const vectors = resources.filter((item) => item.cls === 'vector_layer');
  const intervalVectors = vectors.filter((item) => Number.isInteger(item.fromYear) && Number.isInteger(item.toYear));
  const seedGeoJson = await probeGeoJson(host, seedResourceId);

  const output = {
    schemaVersion: 2,
    discoveredAt: new Date().toISOString(),
    host,
    root,
    seedResource: resourceSummary(resource),
    parentChain: parents,
    resourceCount: resources.length,
    vectorLayerCount: vectors.length,
    intervalVectorLayerCount: intervalVectors.length,
    crawlErrors: errors,
    seedGeoJson,
    vectorLayers: vectors,
  };

  const outDir = path.join(process.cwd(), 'tmp', 'runivers-discovery');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, 'runivers-discovery.json');
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n');

  console.log(`Runivers host: ${host}`);
  console.log(`Boundary root: ${root.id}:${root.displayName}`);
  console.log(`Resources crawled: ${resources.length}`);
  console.log(`Vector layers: ${vectors.length}; interval-like vectors: ${intervalVectors.length}`);
  console.log(`Seed GeoJSON probe: ${JSON.stringify(seedGeoJson.ok ? {ok: true, endpoint: seedGeoJson.endpoint, featureCount: seedGeoJson.featureCount} : seedGeoJson)}`);
  console.log('Sample interval vector layers:');
  for (const item of intervalVectors.slice(0, 120)) {
    console.log(`${item.fromYear}-${item.toYear}\t${item.id}\t${item.path}`);
  }
  if (errors.length) console.log(`Crawl errors: ${JSON.stringify(errors.slice(0, 20))}`);
  console.log(`Discovery written to ${outFile}`);

  if (!vectors.length) throw new Error('Runivers boundary tree contains no discoverable vector layers');
  if (!seedGeoJson.ok) throw new Error('Runivers vector layer is discoverable but no supported GeoJSON/feature export endpoint was found');
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
