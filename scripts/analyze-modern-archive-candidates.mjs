import crypto from 'node:crypto';
import fs from 'node:fs';

const archives = [
  'public/data/territory/archive/ussr.geojson',
  'public/data/territory/archive/russian-federation.geojson',
];

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

const rfPre2004Controls = [
  {id:'moscow',lonLat:[37.6173,55.7558],expected:'inside'},
  {id:'kaliningrad',lonLat:[20.4522,54.7104],expected:'inside'},
  {id:'murmansk',lonLat:[33.0827,68.9707],expected:'inside'},
  {id:'sochi',lonLat:[39.7231,43.5855],expected:'inside'},
  {id:'grozny',lonLat:[45.6986,43.3178],expected:'inside'},
  {id:'vladivostok',lonLat:[131.8855,43.1155],expected:'inside'},
  {id:'yuzhno-sakhalinsk',lonLat:[142.7380,46.9591],expected:'inside'},
  {id:'petropavlovsk-kamchatsky',lonLat:[158.6500,53.0370],expected:'inside'},
  {id:'norilsk',lonLat:[88.2027,69.3558],expected:'inside'},
  {id:'sevastopol',lonLat:[33.5224,44.6166],expected:'outside'},
  {id:'simferopol',lonLat:[34.1024,44.9521],expected:'outside'},
  {id:'kyiv',lonLat:[30.5234,50.4501],expected:'outside'},
  {id:'minsk',lonLat:[27.5615,53.9045],expected:'outside'},
  {id:'tbilisi',lonLat:[44.7930,41.7151],expected:'outside'},
  {id:'astana',lonLat:[71.4304,51.1282],expected:'outside'},
  {id:'riga',lonLat:[24.1052,56.9496],expected:'outside'},
  {id:'donetsk',lonLat:[37.8028,48.0159],expected:'outside'},
  {id:'luhansk',lonLat:[39.3078,48.5740],expected:'outside'},
];

const reports = [];
for (const file of archives) {
  const bytes = fs.readFileSync(file);
  const payload = JSON.parse(bytes.toString('utf8'));
  const gitBlobSha1 = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
  reports.push({
    archive: file,
    archive_git_blob_sha1: gitBlobSha1,
    feature_count: (payload.features ?? []).length,
    candidates: (payload.features ?? []).map((feature, index) => {
      const p = feature.properties ?? {};
      const rfPre2004 = file.endsWith('russian-federation.geojson') && String(p.start_date ?? '') === '1991-12-26' && String(p.end_date ?? '') === '2004-10-14';
      const controls = rfPre2004 ? rfPre2004Controls.map(control => {
        const actual = geometryContains(control.lonLat, feature.geometry) ? 'inside' : 'outside';
        return {...control, actual, pass: actual === control.expected};
      }) : null;
      return {
        index,
        name: p.name ?? p.NAME ?? null,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        source_ids: p.source_ids ?? null,
        confidence: p.confidence ?? null,
        legal_basis: p.legal_basis ?? null,
        provenance: p.provenance ?? null,
        notes: p.notes ?? null,
        status: p.status ?? null,
        geometry_type: feature.geometry?.type ?? null,
        bbox: bboxOfGeometry(feature.geometry),
        rf_pre_2004_controls: controls,
        rf_pre_2004_controls_all_pass: controls ? controls.every(c => c.pass) : null,
      };
    }),
  });
}

const report = {
  schema_version: 2,
  purpose: 'Research-only enumeration and spatial-control check of archived USSR/Russian Federation vector candidates. Does not promote geometry.',
  reports,
};
fs.writeFileSync('modern-archive-candidates.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
