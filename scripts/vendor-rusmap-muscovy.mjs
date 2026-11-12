/**
 * One-time vendoring of the dated Muscovy state contours published by rusmap.org.
 *
 * The output is checked into the repository and read ONLY as provisional
 * display geometry. It must never be mistaken for History Core verification.
 *
 * Upstream data © Историческая карта России / rusmap.org, ODbL 1.0.
 * https://rusmap.org/data/  https://opendatacommons.org/licenses/odbl/1-0/
 */
import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://rusmap.org/data/state-muscovy.geojson';
const DEST = path.join(process.cwd(), 'public/data/territory/rusmap');
const OUT = path.join(DEST, 'state-muscovy.geojson');

function sourceDate(value, field, index) {
  if (value === null || value === undefined || value === '') {
    if (field === 'to') return null; // An open-ended source interval.
    throw new Error('rusmap feature ' + index + ' has no from date');
  }
  const str = String(value).trim();
  // EDTF year, month and full date. Do not manufacture a month/day.
  if (/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(str)) return str;
  throw new Error('Unresolved EDTF ' + field + ' in feature ' + index + ': ' + str);
}

function checkGeometry(geometry, index) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
    throw new Error('Non-polygon feature ' + index + ': ' + (geometry?.type || 'none'));
  }
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polys) || !polys.length) throw new Error('Empty geometry ' + index);
  for (const polygon of polys) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('Empty polygon ' + index);
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) throw new Error('Short ring ' + index);
      for (const point of ring) {
        if (!Array.isArray(point) || point.length < 2 ||
            !Number.isFinite(point[0]) || !Number.isFinite(point[1]) ||
            point[0] < -180 || point[0] > 180 || point[1] < -90 || point[1] > 90) {
          throw new Error('Invalid WGS84 coordinate ' + index);
        }
      }
      const first = ring[0], last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        throw new Error('Unclosed polygon ring ' + index);
      }
    }
  }
}

export function normalizeMuscovy(source, upstreamSha256) {
  if (source?.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('Expected an upstream GeoJSON FeatureCollection');
  }
  if (source.features.length < 12 || source.features.length > 100) {
    throw new Error('Unexpected Muscovy state version count: ' + source.features.length);
  }
  const startYears = new Set();
  const features = source.features.map((feature, i) => {
    if (feature?.type !== 'Feature' || !feature.properties) {
      throw new Error('Invalid Feature structure ' + i);
    }
    const from = sourceDate(feature.properties.from, 'from', i);
    const to = sourceDate(feature.properties.to, 'to', i);
    if (to && to < from) throw new Error('Reversed date range ' + i);
    checkGeometry(feature.geometry, i);
    startYears.add(Number(from.slice(0, 4)));
    return {
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        start_date: from,
        end_date: to,
        history_core_status: 'reconstruction-provisional',
        history_core_source: 'rusmap.org',
        history_core_source_license: 'ODbL-1.0',
      },
    };
  });
  const years = [...startYears].sort((a, b) => a - b);
  if (years[0] > 1485 || years.at(-1) < 1600 || years.length < 8) {
    throw new Error('Muscovy dated source does not cover expected interval: ' + years.join(', '));
  }
  return {
    type: 'FeatureCollection',
    metadata: {
      dataset: 'Historic state boundary display reconstruction: Muscovy',
      usage: 'provisional visual reference only; not independently verified by History Core',
      source: SOURCE,
      source_attribution: 'Историческая карта России, rusmap.org',
      license: 'ODbL-1.0',
      license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
      upstream_sha256: upstreamSha256,
      adaptation: 'Preserved geometries and source feature properties; added History Core display dates and provisional labels',
      version_count: source.features.length,
      start_years: years,
    },
    features,
  };
}

async function main() {
  const response = await fetch(SOURCE, {
    headers: {Accept: 'application/geo+json, application/json;q=0.9'},
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error('rusmap HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 10000 || bytes.length > 2_000_000) {
    throw new Error('Unexpected source size: ' + bytes.length);
  }
  const digest = createHash('sha256').update(bytes).digest('hex');
  const normalized = normalizeMuscovy(JSON.parse(bytes.toString('utf8')), digest);
  await mkdir(DEST, {recursive: true});
  await writeFile(OUT, JSON.stringify(normalized) + '\n');
  const manifest = {
    source_url: SOURCE,
    upstream_sha256: digest,
    output_file: 'state-muscovy.geojson',
    source_license: 'ODbL-1.0',
    attribution: 'Историческая карта России, rusmap.org',
    version_count: normalized.metadata.version_count,
    dated_versions: normalized.metadata.start_years,
    display_policy: 'provisional bootstrap; do not override geometry-verified History Core months',
    downloaded_for_vendoring: true,
  };
  await writeFile(path.join(DEST, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {console.error(error); process.exitCode = 1;});
}
