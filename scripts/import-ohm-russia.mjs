import fs from 'node:fs/promises';
import path from 'node:path';
import osmtogeojson from 'osmtogeojson';

const OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
const OUT_DIR = path.resolve('public/data/territory/ohm');
const IMPORTED_AT = new Date().toISOString();

const POLITIES = [
  { id: 'kievan-rus', label: 'Древнерусское государство / Киевская Русь', wikidata: ['Q1108445'], names: ['Kievan Rus', "Kievan Rus'", 'Kyivan Rus', "Kyivan Rus'", 'Киевская Русь', 'Древнерусское государство'] },
  { id: 'novgorodian-land', label: 'Новгородская земля', wikidata: ['Q9324216'], names: ['Novgorodian Land', 'Novgorodian Rus', 'Новгородская земля'] },
  { id: 'novgorod-republic', label: 'Новгородская республика', wikidata: ['Q151536'], names: ['Novgorod Republic', 'Great Novgorod', 'Новгородская республика', 'Господин Великий Новгород'] },
  { id: 'grand-vladimir', label: 'Великое княжество Владимирское', wikidata: ['Q83546'], names: ['Grand Principality of Vladimir', 'Vladimir-Suzdal', 'Великое княжество Владимирское', 'Владимиро-Суздальское княжество'] },
  { id: 'grand-moscow', label: 'Великое княжество Московское', wikidata: ['Q170770'], names: ['Grand Principality of Moscow', 'Grand Duchy of Moscow', 'Muscovy', 'Великое княжество Московское', 'Московское княжество'] },
  { id: 'russian-tsardom', label: 'Русское царство', wikidata: ['Q186096'], names: ['Tsardom of Russia', 'Russian Tsardom', 'Русское царство', 'Российское царство'] },
  { id: 'russian-empire', label: 'Российская империя', wikidata: ['Q34266'], names: ['Russian Empire', 'Российская империя', 'Российская Империя'] },
  { id: 'russian-republic', label: 'Российская республика', wikidata: ['Q139319'], names: ['Russian Republic', 'Российская республика'] },
  { id: 'rsfsr', label: 'РСФСР', wikidata: ['Q2184'], names: ['Russian Soviet Federative Socialist Republic', 'Russian SFSR', 'RSFSR', 'РСФСР', 'Российская Советская Федеративная Социалистическая Республика'] },
  { id: 'ussr', label: 'СССР', wikidata: ['Q15180'], names: ['Soviet Union', 'Union of Soviet Socialist Republics', 'USSR', 'СССР', 'Союз Советских Социалистических Республик'] },
  { id: 'russian-federation', label: 'Российская Федерация', wikidata: ['Q159'], names: ['Russia', 'Russian Federation', 'Россия', 'Российская Федерация'] }
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeQuery(polities) {
  const wikidata = [...new Set(polities.flatMap((polity) => polity.wikidata))].map(escapeRegex).join('|');
  const names = [...new Set(polities.flatMap((polity) => polity.names))].map(escapeRegex).join('|');
  return `[out:json][timeout:120];\n(\nrelation["boundary"="administrative"]["wikidata"~"^(${wikidata})$"];\nrelation["boundary"="administrative"]["name"~"^(${names})$",i];\n);\nout body geom;`;
}

async function requestBatch(polities) {
  const response = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'rulers-of-russia-territory-import/2.0'
    },
    body: new URLSearchParams({ data: makeQuery(polities) })
  });
  if (!response.ok) throw new Error(`OHM Overpass ${response.status} ${response.statusText}`);
  return response.json();
}

async function requestWithSplit(polities, errors) {
  try {
    const osm = await requestBatch(polities);
    return [osm];
  } catch (error) {
    if (polities.length === 1) {
      errors.set(polities[0].id, String(error));
      return [];
    }
    const middle = Math.ceil(polities.length / 2);
    console.warn(`Batch of ${polities.length} failed; retrying as ${middle}+${polities.length - middle}`);
    return [
      ...(await requestWithSplit(polities.slice(0, middle), errors)),
      ...(await requestWithSplit(polities.slice(middle), errors))
    ];
  }
}

function tagsOf(feature) {
  const properties = feature.properties ?? {};
  return properties.tags ?? properties;
}

function matchPolity(feature) {
  const tags = tagsOf(feature);
  const wikidata = String(tags.wikidata ?? '');
  const names = [tags.name, tags['name:en'], tags['name:ru']].filter(Boolean).map((value) => String(value).toLocaleLowerCase('ru'));
  return POLITIES.find((polity) =>
    polity.wikidata.includes(wikidata) || polity.names.some((candidate) => names.includes(candidate.toLocaleLowerCase('ru')))
  );
}

function isUsable(feature) {
  return feature?.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon');
}

function normalizeFeature(feature, polity) {
  const tags = tagsOf(feature);
  const relationId = feature.properties?.id ?? tags['@id'] ?? feature.id ?? null;
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
      start_date: tags.start_date ?? null,
      end_date: tags.end_date ?? null,
      admin_level: tags.admin_level ?? null,
      boundary: tags.boundary ?? null,
      source: tags.source ?? null,
      source_ref: tags['source:ref'] ?? null,
      source_url: tags['source:url'] ?? null,
      license: tags.license ?? 'CC0-or-feature-specific-open-license',
      imported_from: 'OpenHistoricalMap',
      imported_at: IMPORTED_AT,
      runtime_dependency: false
    },
    geometry: feature.geometry
  };
}

function sortByStart(a, b) {
  return String(a.properties?.start_date ?? '0000').localeCompare(String(b.properties?.start_date ?? '0000'));
}

await fs.mkdir(OUT_DIR, { recursive: true });
const errors = new Map();
const osmResponses = await requestWithSplit(POLITIES, errors);
const convertedFeatures = [];

for (const osm of osmResponses) {
  try {
    const converted = osmtogeojson(osm, { flatProperties: false });
    convertedFeatures.push(...converted.features.filter(isUsable));
  } catch (error) {
    console.error(`OSM→GeoJSON conversion failed for one batch: ${String(error)}`);
  }
}

const manifest = [];
for (const polity of POLITIES) {
  const features = convertedFeatures
    .filter((feature) => matchPolity(feature)?.id === polity.id)
    .map((feature) => normalizeFeature(feature, polity))
    .sort(sortByStart);

  const collection = {
    type: 'FeatureCollection',
    metadata: {
      polity_id: polity.id,
      polity_label: polity.label,
      imported_from: 'OpenHistoricalMap',
      upstream: 'https://www.openhistoricalmap.org/',
      upstream_api: OVERPASS,
      imported_at: IMPORTED_AT,
      license_note: 'OHM is CC0 except individual features carrying another open license. Preserve per-feature license/source metadata.',
      runtime_dependency: false,
      feature_count: features.length
    },
    features
  };

  const fileName = `${polity.id}.geojson`;
  await fs.writeFile(path.join(OUT_DIR, fileName), `${JSON.stringify(collection)}\n`, 'utf8');
  const error = errors.get(polity.id) ?? null;
  manifest.push({
    polity_id: polity.id,
    label: polity.label,
    file: `./${fileName}`,
    features: features.length,
    status: features.length ? 'imported' : error ? 'import-error' : 'missing-upstream',
    error
  });
  console.log(`${polity.id}: ${features.length} polygon(s)${error ? ` · ${error}` : ''}`);
}

await fs.writeFile(
  path.join(OUT_DIR, 'manifest.json'),
  `${JSON.stringify({ generated_at: IMPORTED_AT, source: 'OpenHistoricalMap', runtime_dependency: false, endpoint: OVERPASS, polities: manifest }, null, 2)}\n`,
  'utf8'
);

console.log('OHM import finished. The cache is static project data; the browser never queries OHM. Review imported geometries before marking a snapshot verified.');
