import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import rewind from '@mapbox/geojson-rewind';

const PINNED_COMMIT = '62d8f1a03a71f2d3ff17f2d166f7553f256bce68';
const SOURCE_ROOT = `https://raw.githubusercontent.com/aourednik/historical-basemaps/${PINNED_COMMIT}`;
const OUT_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'world-history');
const SNAPSHOT_ROOT = path.join(OUT_ROOT, 'snapshots');
const TERRAIN_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'terrain');
const HYDRO_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'hydro');
const CULTURAL_ROOT = path.join(process.cwd(), 'public', 'data', 'territory', 'cultural');
const NATURAL_EARTH_COMMIT = 'ca96624a';
const RIVERS_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_COMMIT}/geojson/ne_50m_rivers_lake_centerlines.geojson`;
const COUNTRIES_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NATURAL_EARTH_COMMIT}/geojson/ne_50m_admin_0_countries.geojson`;
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

async function ensureBytes(target, url) {
  if (!existsSync(target)) await writeFile(target, await fetchBytes(url));
}

async function ensureText(target, url) {
  if (!existsSync(target)) await writeFile(target, await fetchText(url), 'utf8');
}

async function normalizeGeoJsonFile(target, sourceUrl) {
  const raw = existsSync(target) ? await readFile(target, 'utf8') : await fetchText(sourceUrl);
  const data = JSON.parse(raw);
  rewind(data, false);
  await writeFile(target, `${JSON.stringify(data)}\n`, 'utf8');
}

async function main() {
  await mkdir(SNAPSHOT_ROOT, { recursive: true });
  await mkdir(TERRAIN_ROOT, { recursive: true });
  await mkdir(HYDRO_ROOT, { recursive: true });
  await mkdir(CULTURAL_ROOT, { recursive: true });

  const riversPath = path.join(HYDRO_ROOT, 'rivers_50m.geojson');
  const countriesPath = path.join(CULTURAL_ROOT, 'countries_50m.geojson');

  await Promise.all([
    ensureText(riversPath, RIVERS_URL),
    normalizeGeoJsonFile(countriesPath, COUNTRIES_URL)
  ]);

  const upstreamIndex = JSON.parse(await fetchText(`${SOURCE_ROOT}/index.json`));
  const rows = (upstreamIndex.years ?? [])
    .filter((row) => Number.isFinite(row.year) && row.year >= MIN_YEAR && row.year <= MAX_YEAR && row.filename)
    .sort((a, b) => a.year - b.year);

  if (!rows.length) throw new Error('No historical world snapshots found in requested range.');

  const snapshots = [];
  for (const row of rows) {
    const localName = `${row.year}.geojson`;
    const localPath = path.join(SNAPSHOT_ROOT, localName);
    await normalizeGeoJsonFile(localPath, `${SOURCE_ROOT}/geojson/${row.filename}`);

    snapshots.push({
      year: row.year,
      file: `snapshots/${localName}`,
      upstream_file: row.filename,
      entities: Array.isArray(row.countries) ? row.countries.length : null
    });
  }

  const index = {
    schema_version: 5,
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
      relief_preview: 'terrain/earth_relief_4096.webp',
      relief_medium: 'terrain/earth_relief_8192.webp',
      relief_high: 'terrain/earth_relief_12288.webp',
      dataset: 'Natural Earth HYP_HR_SR_W cross-blended hypsometric shaded relief with water',
      source_resolution: '21600x10800',
      runtime_external_dependency: false
    },
    hydrography: {
      rivers: 'hydro/rivers_50m.geojson',
      source: RIVERS_URL,
      dataset: 'Natural Earth 1:50m rivers and lake centerlines'
    },
    modern_world: {
      countries: 'cultural/countries_50m.geojson',
      source: COUNTRIES_URL,
      dataset: 'Natural Earth 1:50m admin-0 countries'
    },
    min_year: snapshots[0].year,
    max_year: snapshots[snapshots.length - 1].year,
    snapshots
  };

  await writeFile(path.join(OUT_ROOT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`Historical world archive ready: ${snapshots.length} snapshots (${index.min_year}..${index.max_year}); progressive Natural Earth relief, normalized polygons, rivers and modern countries vendored locally.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
