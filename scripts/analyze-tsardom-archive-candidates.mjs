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

const rows = (payload.features ?? []).map((feature, index) => {
  const p = feature.properties ?? {};
  return {
    index,
    name: p.name ?? p.NAME ?? null,
    start_date: p.start_date ?? null,
    end_date: p.end_date ?? null,
    source_ids: p.source_ids ?? null,
    geometry_type: feature.geometry?.type ?? null,
    bbox: bboxOfGeometry(feature.geometry),
    property_keys: Object.keys(p).sort(),
  };
});

const report = {
  schema_version: 1,
  purpose: 'Research-only enumeration of archived Russian Tsardom vector candidates. Does not promote geometry.',
  archive: file,
  archive_git_blob_sha1: gitBlobSha1,
  feature_count: rows.length,
  candidates: rows,
};
fs.writeFileSync('tsardom-archive-candidates.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
