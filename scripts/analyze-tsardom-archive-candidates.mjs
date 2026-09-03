import crypto from 'node:crypto';
import fs from 'node:fs';

const file = 'public/data/territory/archive/russian-tsardom.geojson';
const bytes = fs.readFileSync(file);
const payload = JSON.parse(bytes.toString('utf8'));
const gitBlobSha1 = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

function bboxOfGeometry(geometry) {
  const points = [];
  const walk = value => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) points.push(value);
    else for (const child of value) walk(child);
  };
  walk(geometry?.coordinates);
  if (!points.length) return null;
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(v => Math.round(v * 1e5) / 1e5);
}

function ringContains([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
function polygonContains(point, polygon) {
  return Boolean(polygon?.length && ringContains(point, polygon[0]) && !polygon.slice(1).some(hole => ringContains(point, hole)));
}
function geometryContains(point, geometry) {
  if (geometry?.type === 'Polygon') return polygonContains(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some(polygon => polygonContains(point, polygon));
  return false;
}

const controls1598 = [
  {id:'moscow', lonLat:[37.6173,55.7558], expected:'inside'},
  {id:'novgorod', lonLat:[31.2755,58.5229], expected:'inside'},
  {id:'pskov', lonLat:[28.3318,57.8193], expected:'inside'},
  {id:'smolensk', lonLat:[32.0453,54.7826], expected:'inside'},
  {id:'kazan', lonLat:[49.1221,55.7887], expected:'inside'},
  {id:'astrakhan', lonLat:[48.0408,46.3497], expected:'inside'},
  {id:'tyumen', lonLat:[65.5343,57.1530], expected:'inside'},
  {id:'tobolsk', lonLat:[68.2538,58.1981], expected:'inside'},
  {id:'arkhangelsk', lonLat:[40.5433,64.5393], expected:'inside'},
  {id:'warsaw', lonLat:[21.0122,52.2297], expected:'outside'},
  {id:'vilnius', lonLat:[25.2797,54.6872], expected:'outside'},
  {id:'riga', lonLat:[24.1052,56.9496], expected:'outside'},
  {id:'kyiv', lonLat:[30.5234,50.4501], expected:'outside'},
];

const rows = (payload.features ?? []).map((feature, index) => {
  const p = feature.properties ?? {};
  const is1598Candidate = String(p.start_date ?? '') === '1595-05-18' && String(p.end_date ?? '') === '1617-02-17';
  const controls = is1598Candidate ? controls1598.map(control => {
    const actual = geometryContains(control.lonLat, feature.geometry) ? 'inside' : 'outside';
    return {...control, actual, pass: actual === control.expected};
  }) : null;
  return {
    index,
    name: p.name ?? p.NAME ?? null,
    start_date: p.start_date ?? null,
    end_date: p.end_date ?? null,
    source_ids: p.source_ids ?? null,
    geometry_type: feature.geometry?.type ?? null,
    bbox: bboxOfGeometry(feature.geometry),
    property_keys: Object.keys(p).sort(),
    controls_1598: controls,
    controls_1598_all_pass: controls ? controls.every(c => c.pass) : null,
  };
});

const report = {
  schema_version: 2,
  purpose: 'Research-only enumeration and independent spatial-control check of archived Russian Tsardom vector candidates. Does not promote geometry.',
  archive: file,
  archive_git_blob_sha1: gitBlobSha1,
  feature_count: rows.length,
  candidates: rows,
};
fs.writeFileSync('tsardom-archive-candidates.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
