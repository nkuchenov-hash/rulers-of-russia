import fs from 'node:fs';

function ringContains([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const hit = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function polygonContains(point, polygon) {
  return Boolean(polygon?.length && ringContains(point, polygon[0]) && !polygon.slice(1).some((hole) => ringContains(point, hole)));
}

function contains(point, geometry) {
  if (geometry?.type === 'Polygon') return polygonContains(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => polygonContains(point, polygon));
  return false;
}

const archive = JSON.parse(fs.readFileSync('public/data/territory/archive/russian-empire.geojson', 'utf8'));
const unresolved = [
  [1727, 1737], [1783, 1797], [1800, 1800], [1802, 1802], [1805, 1814], [1828, 1833],
  [1848, 1856], [1860, 1867], [1873, 1879], [1885, 1890], [1895, 1899], [1905, 1916]
];
const points = {
  moscow: [37.6173, 55.7558], smolensk: [32.0453, 54.7826], st_petersburg: [30.3351, 59.9343],
  kyiv: [30.5234, 50.4501], minsk: [27.5615, 53.9045], vilnius: [25.2797, 54.6872],
  kerch: [36.468, 45.356], sevastopol: [33.5254, 44.6167], odessa: [30.7233, 46.4825],
  chisinau: [28.8353, 47.0105], warsaw: [21.0122, 52.2297], helsinki: [24.9384, 60.1699],
  tbilisi: [44.793, 41.7151], yerevan: [44.5152, 40.1872], baku: [49.8671, 40.4093],
  tashkent: [69.2401, 41.2995], samarkand: [66.9597, 39.6542], khiva: [60.3639, 41.3783],
  almaty: [76.886, 43.2389], vladivostok: [131.8855, 43.1155], yuzhno_sakhalinsk: [142.738, 46.9591],
  anchorage: [-149.9003, 61.2181], kabul: [69.2075, 34.5553], tehran: [51.389, 35.6892], beijing: [116.4074, 39.9042]
};

const rows = [];
for (let index = 0; index < archive.features.length; index++) {
  const feature = archive.features[index];
  const start = Number(feature.properties?.start_date);
  const end = Number(feature.properties?.end_date);
  if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
  if (!unresolved.some(([a, b]) => start <= b && end >= a)) continue;
  const containment = Object.fromEntries(Object.entries(points).map(([name, point]) => [name, contains(point, feature.geometry)]));
  rows.push({
    index,
    start,
    end,
    name: feature.properties?.name ?? feature.properties?.NAME ?? null,
    relationId: feature.properties?.osm_id ?? feature.properties?.id ?? null,
    source: feature.properties?.source ?? null,
    containment
  });
}

const output = { schema_version: 1, archiveFeatureCount: archive.features.length, rows };
fs.writeFileSync('empire-gap-candidates-v2.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
