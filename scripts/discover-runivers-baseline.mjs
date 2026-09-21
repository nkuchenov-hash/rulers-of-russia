import fs from 'node:fs';
import path from 'node:path';

const hosts = [
  'https://gis.runivers.ru',
  'http://gis.runivers.ru',
];
const seedResourceId = 5455;
const timeoutMs = 20000;

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

function parentId(resource) {
  return resource?.resource?.parent?.id ?? resource?.parent?.id ?? null;
}

function resourceSummary(item) {
  const resource = item?.resource ?? item ?? {};
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
  for (let depth = 0; depth < 8; depth += 1) {
    const id = parentId(current);
    if (id === null || id === undefined || id === 0 || seen.has(id)) break;
    seen.add(id);
    current = await getJson(`${host}/api/resource/${id}`);
    chain.push(resourceSummary(current));
  }
  return chain;
}

function yearFromName(value) {
  const matches = String(value ?? '').match(/(?:^|\D)(8\d{2}|9\d{2}|1\d{3}|20[0-2]\d)(?:\D|$)/g) ?? [];
  for (const raw of matches) {
    const match = raw.match(/(8\d{2}|9\d{2}|1\d{3}|20[0-2]\d)/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function main() {
  const {host, resource} = await findHost();
  const parents = await walkParents(host, resource);
  const candidateParentIds = [...new Set([
    parentId(resource),
    ...parents.map((item) => item.id),
  ].filter((value) => Number.isInteger(value) && value >= 0))];

  const listings = [];
  for (const id of candidateParentIds) {
    try {
      const children = await listChildren(host, id);
      listings.push({
        parentId: id,
        children: children.map(resourceSummary),
      });
    } catch (error) {
      listings.push({parentId: id, error: error?.message ?? String(error), children: []});
    }
  }

  const resources = listings.flatMap((listing) => listing.children);
  const datedResources = resources
    .map((item) => ({...item, year: yearFromName(item.displayName) ?? yearFromName(item.keyname)}))
    .filter((item) => Number.isInteger(item.year))
    .sort((a, b) => a.year - b.year || (a.id ?? 0) - (b.id ?? 0));

  const output = {
    schemaVersion: 1,
    discoveredAt: new Date().toISOString(),
    host,
    seedResource: resourceSummary(resource),
    parentChain: parents,
    listings,
    datedResources,
  };

  const outDir = path.join(process.cwd(), 'tmp', 'runivers-discovery');
  fs.mkdirSync(outDir, {recursive: true});
  const outFile = path.join(outDir, 'runivers-discovery.json');
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2) + '\n');

  console.log(`Runivers host: ${host}`);
  console.log(`Seed resource: ${JSON.stringify(output.seedResource)}`);
  console.log(`Parent chain: ${parents.map((item) => `${item.id}:${item.displayName}`).join(' -> ')}`);
  console.log(`Dated resources discovered: ${datedResources.length}`);
  for (const item of datedResources.slice(0, 80)) {
    console.log(`${item.year}\t${item.id}\t${item.cls}\t${item.displayName}`);
  }
  console.log(`Discovery written to ${outFile}`);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
