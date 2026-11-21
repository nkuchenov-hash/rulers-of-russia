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
function coordinateCount(geometry) {
  let count = 0;
  const walk = value => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) count += 1;
    else for (const child of value) walk(child);
  };
  walk(geometry?.coordinates);
  return count;
}
function geometryHash(geometry) {
  return crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex');
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
function xmlAttr(xml, name) {
  const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m?.[1] ?? null;
}
async function fetchRelationMetadata(id) {
  const url = `https://api.openhistoricalmap.org/api/0.6/relation/${id}`;
  try {
    const response = await fetch(url, {headers:{'user-agent':'rulers-of-russia-history-core-research/1.0'}});
    const xml = await response.text();
    if (!response.ok) return {id, url, ok:false, status:response.status};
    const relationTag = xml.match(/<relation\b[^>]*>/)?.[0] ?? '';
    const licenseTags = [...xml.matchAll(/<tag\s+k="license"\s+v="([^"]+)"\s*\/>/g)].map(m => m[1]);
    return {
      id,
      url,
      ok:true,
      version: xmlAttr(relationTag, 'version'),
      changeset: xmlAttr(relationTag, 'changeset'),
      timestamp: xmlAttr(relationTag, 'timestamp'),
      visible: xmlAttr(relationTag, 'visible'),
      explicit_license_tags: licenseTags,
    };
  } catch (error) {
    return {id, url, ok:false, error:String(error)};
  }
}

const controls = [
  {id:'moscow', lonLat:[37.6173,55.7558]}, {id:'novgorod', lonLat:[31.2755,58.5229]},
  {id:'pskov', lonLat:[28.3318,57.8193]}, {id:'smolensk', lonLat:[32.0453,54.7826]},
  {id:'kazan', lonLat:[49.1064,55.7963]}, {id:'astrakhan', lonLat:[48.0408,46.3497]},
  {id:'tyumen', lonLat:[65.5343,57.1530]}, {id:'tobolsk', lonLat:[68.2538,58.1981]},
  {id:'tomsk', lonLat:[84.9482,56.4846]}, {id:'krasnoyarsk', lonLat:[92.8932,56.0153]},
  {id:'irkutsk', lonLat:[104.2807,52.2864]}, {id:'yakutsk', lonLat:[129.7326,62.0278]},
  {id:'okhotsk', lonLat:[143.217,59.36]}, {id:'kyiv', lonLat:[30.5234,50.4501]},
  {id:'warsaw', lonLat:[21.0122,52.2297]}, {id:'riga', lonLat:[24.1052,56.9496]},
  {id:'azov', lonLat:[39.416,47.112]}, {id:'bakhchysarai', lonLat:[33.857,44.75]},
  {id:'narva', lonLat:[28.19,59.38]},
];

const rows = (payload.features ?? []).map((feature, index) => {
  const p = feature.properties ?? {};
  return {
    index,
    properties: p,
    start_date: p.start_date ?? null,
    end_date: p.end_date ?? null,
    source_ids: p.source_ids ?? null,
    geometry_type: feature.geometry?.type ?? null,
    bbox: bboxOfGeometry(feature.geometry),
    coordinate_count: coordinateCount(feature.geometry),
    geometry_sha256: geometryHash(feature.geometry),
    control_membership: Object.fromEntries(controls.map(c => [c.id, geometryContains(c.lonLat, feature.geometry)])),
  };
});
const duplicateGeometryGroups = Object.values(rows.reduce((groups, row) => {
  (groups[row.geometry_sha256] ??= []).push(row.index);
  return groups;
}, {})).filter(group => group.length > 1);
const relationIds = [...new Set(rows.map(row => row.properties?.provenance?.capture_id).filter(Number.isInteger))];
const relationMetadata = await Promise.all(relationIds.map(fetchRelationMetadata));

const report = {
  schema_version: 5,
  purpose: 'Research-only enumeration, source-version lookup and broad spatial fingerprinting of archived Russian Tsardom vector candidates. Does not promote geometry.',
  archive: file,
  archive_git_blob_sha1: gitBlobSha1,
  feature_count: rows.length,
  duplicate_geometry_groups: duplicateGeometryGroups,
  relation_metadata: relationMetadata,
  candidates: rows,
};
fs.writeFileSync('tsardom-archive-candidates.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
