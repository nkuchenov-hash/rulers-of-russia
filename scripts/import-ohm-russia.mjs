import fs from 'node:fs/promises';
import path from 'node:path';
import osmtogeojson from 'osmtogeojson';

const OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
const OUT_DIR = path.resolve('public/data/territory/ohm');

const POLITIES = [
  {
    id: 'kievan-rus',
    label: 'Древнерусское государство / Киевская Русь',
    wikidata: ['Q1108445'],
    names: ['Kievan Rus', "Kievan Rus'", 'Kyivan Rus', "Kyivan Rus'", 'Киевская Русь', 'Древнерусское государство']
  },
  {
    id: 'novgorodian-land',
    label: 'Новгородская земля',
    wikidata: ['Q9324216'],
    names: ['Novgorodian Land', 'Novgorodian Rus', 'Новгородская земля']
  },
  {
    id: 'novgorod-republic',
    label: 'Новгородская республика',
    wikidata: ['Q151536'],
    names: ['Novgorod Republic', 'Great Novgorod', 'Новгородская республика', 'Господин Великий Новгород']
  },
  {
    id: 'grand-vladimir',
    label: 'Великое княжество Владимирское',
    wikidata: ['Q83546'],
    names: ['Grand Principality of Vladimir', 'Vladimir-Suzdal', 'Великое княжество Владимирское', 'Владимиро-Суздальское княжество']
  },
  {
    id: 'grand-moscow',
    label: 'Великое княжество Московское',
    wikidata: ['Q170770'],
    names: ['Grand Principality of Moscow', 'Grand Duchy of Moscow', 'Muscovy', 'Великое княжество Московское', 'Московское княжество']
  },
  {
    id: 'russian-tsardom',
    label: 'Русское царство',
    wikidata: ['Q186096'],
    names: ['Tsardom of Russia', 'Russian Tsardom', 'Русское царство', 'Российское царство']
  },
  {
    id: 'russian-empire',
    label: 'Российская империя',
    wikidata: ['Q34266'],
    names: ['Russian Empire', 'Российская империя', 'Российская Империя']
  },
  {
    id: 'russian-republic',
    label: 'Российская республика',
    wikidata: ['Q139319'],
    names: ['Russian Republic', 'Российская республика']
  },
  {
    id: 'rsfsr',
    label: 'РСФСР',
    wikidata: ['Q2184'],
    names: ['Russian Soviet Federative Socialist Republic', 'Russian SFSR', 'RSFSR', 'РСФСР', 'Российская Советская Федеративная Социалистическая Республика']
  },
  {
    id: 'ussr',
    label: 'СССР',
    wikidata: ['Q15180'],
    names: ['Soviet Union', 'Union of Soviet Socialist Republics', 'USSR', 'СССР', 'Союз Советских Социалистических Республик']
  },
  {
    id: 'russian-federation',
    label: 'Российская Федерация',
    wikidata: ['Q159'],
    names: ['Russia', 'Russian Federation', 'Россия', 'Российская Федерация']
  }
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function overpassQuery(polity) {
  const nameRegex = polity.names.map(escapeRegex).join('|');
  const wikidataQueries = polity.wikidata
    .map((id) => `relation["boundary"="administrative"]["wikidata"="${id}"];`)
    .join('\n');

  return `[out:json][timeout:180];\n(\n${wikidataQueries}\nrelation["boundary"="administrative"]["name"~"^(${nameRegex})$",i];\n);\nout body geom;`;
}

function normalizeFeature(feature, polity) {
  const p = feature.properties ?? {};
  const tags = p.tags ?? p;
  const start = tags.start_date ?? null;
  const end = tags.end_date ?? null;
  const relationId = p.id ?? tags['@id'] ?? null;
  const license = tags.license ?? 'CC0-or-feature-specific-open-license';

  return {
    type: 'Feature',
    id: relationId,
    properties: {
      polity_id: polity.id,
      polity_label: polity.label,
      ohm_id: relationId,
      name: tags['name:ru'] ?? tags.name ?? tags['name:en'] ?? polity.label,
      name_ru: tags['name:ru'] ?? null,
      name_en: tags['name:en'] ?? null,
      wikidata: tags.wikidata ?? null,
      start_date: start,
      end_date: end,
      admin_level: tags.admin_level ?? null,
      boundary: tags.boundary ?? null,
      source: tags.source ?? null,
      source_ref: tags['source:ref'] ?? null,
      source_url: tags['source:url'] ?? null,
      license,
      imported_from: 'OpenHistoricalMap',
      imported_at: new Date().toISOString(),
      runtime_dependency: false
    },
    geometry: feature.geometry
  };
}

function isUsable(feature) {
  return feature?.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
}

function sortByStart(a, b) {
  const aa = String(a.properties?.start_date ?? '0000');
  const bb = String(b.properties?.start_date ?? '0000');
  return aa.localeCompare(bb);
}

async function fetchPolity(polity) {
  const query = overpassQuery(polity);
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'rulers-of-russia-territory-import/1.0'
    },
    body: new URLSearchParams({ data: query })
  });

  if (!response.ok) {
    throw new Error(`${polity.id}: OHM Overpass ${response.status} ${response.statusText}`);
  }

  const osm = await response.json();
  const converted = osmtogeojson(osm, { flatProperties: false });
  const features = converted.features
    .filter(isUsable)
    .map((feature) => normalizeFeature(feature, polity))
    .sort(sortByStart);

  return {
    type: 'FeatureCollection',
    metadata: {
      polity_id: polity.id,
      polity_label: polity.label,
      imported_from: 'OpenHistoricalMap',
      upstream: 'https://www.openhistoricalmap.org/',
      upstream_api: OVERPASS,
      imported_at: new Date().toISOString(),
      license_note: 'OHM is CC0 except individual features carrying another open license. Preserve each feature license/source metadata.',
      runtime_dependency: false,
      feature_count: features.length
    },
    features
  };
}

await fs.mkdir(OUT_DIR, { recursive: true });

const manifest = [];
for (const polity of POLITIES) {
  process.stdout.write(`Importing ${polity.id}... `);
  try {
    const geojson = await fetchPolity(polity);
    const file = path.join(OUT_DIR, `${polity.id}.geojson`);
    await fs.writeFile(file, `${JSON.stringify(geojson)}\n`, 'utf8');
    manifest.push({
      polity_id: polity.id,
      label: polity.label,
      file: `./${polity.id}.geojson`,
      features: geojson.features.length,
      status: geojson.features.length ? 'imported' : 'missing-upstream'
    });
    console.log(`${geojson.features.length} polygon(s)`);
  } catch (error) {
    manifest.push({ polity_id: polity.id, label: polity.label, file: null, features: 0, status: 'import-error', error: String(error) });
    console.error(String(error));
  }
}

await fs.writeFile(
  path.join(OUT_DIR, 'manifest.json'),
  `${JSON.stringify({ generated_at: new Date().toISOString(), source: 'OpenHistoricalMap', runtime_dependency: false, polities: manifest }, null, 2)}\n`,
  'utf8'
);

console.log('OHM import complete. Review geometries and source metadata before promoting any snapshot to verified production data.');
