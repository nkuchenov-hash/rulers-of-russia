import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PINNED_COMMIT = '62d8f1a03a71f2d3ff17f2d166f7553f256bce68';
const SOURCE_ROOT = `https://raw.githubusercontent.com/aourednik/historical-basemaps/${PINNED_COMMIT}`;
const OUT_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'world-history');
const SNAPSHOT_ROOT = path.join(OUT_ROOT, 'snapshots');
const TERRAIN_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'terrain');
const TERRAIN_NORMAL_URL = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg';
const MIN_YEAR = 800;
const MAX_YEAR = 2026;

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'rulers-of-russia-data-sync' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.text();
}

async function fetchBytes(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'rulers-of-russia-data-sync' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(SNAPSHOT_ROOT, { recursive: true });
  await mkdir(TERRAIN_ROOT, { recursive: true });

  const terrainPath = path.join(TERRAIN_ROOT, 'earth_normal_2048.jpg');
  if (!existsSync(terrainPath)) {
    await writeFile(terrainPath, await fetchBytes(TERRAIN_NORMAL_URL));
  }

  const upstreamIndex = JSON.parse(await fetchText(`${SOURCE_ROOT}/index.json`));
  const rows = (upstreamIndex.years ?? [])
    .filter((row) => Number.isFinite(row.year) && row.year >= MIN_YEAR && row.year <= MAX_YEAR && row.filename)
    .sort((a, b) => a.year - b.year);

  if (!rows.length) throw new Error('No historical world snapshots found in requested range.');

  const snapshots = [];
  for (const row of rows) {
    const localName = `${row.year}.geojson`;
    const localPath = path.join(SNAPSHOT_ROOT, localName);

    // A committed project-owned file wins. This is deliberate: once we correct a
    // historical boundary locally, subsequent syncs must not overwrite our edit.
    if (!existsSync(localPath)) {
      const body = await fetchText(`${SOURCE_ROOT}/geojson/${row.filename}`);
      await writeFile(localPath, body, 'utf8');
    }

    snapshots.push({
      year: row.year,
      file: `snapshots/${localName}`,
      upstream_file: row.filename,
      entities: Array.isArray(row.countries) ? row.countries.length : null
    });
  }

  const index = {
    schema_version: 1,
    dataset: 'Rulers of Russia historical world boundary archive',
    runtime_external_dependency: false,
    resolution: 'For every selected year, use the most recent historical snapshot at or before that year.',
    editable: true,
    source: {
      name: 'Historical Basemaps',
      repository: 'aourednik/historical-basemaps',
      pinned_commit: PINNED_COMMIT,
      license_note: 'Preserve upstream attribution/license metadata when redistributing or editing source-derived geometry.'
    },
    terrain: {
      normal_map: 'terrain/earth_normal_2048.jpg',
      source: TERRAIN_NORMAL_URL
    },
    min_year: snapshots[0].year,
    max_year: snapshots[snapshots.length - 1].year,
    snapshots
  };

  await writeFile(path.join(OUT_ROOT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`Historical world archive ready: ${snapshots.length} snapshots (${index.min_year}..${index.max_year}).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
