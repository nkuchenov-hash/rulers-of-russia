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
      return {
        index,
        name: p.name ?? p.NAME ?? null,
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        source_ids: p.source_ids ?? null,
        confidence: p.confidence ?? null,
        legal_basis: p.legal_basis ?? null,
        geometry_type: feature.geometry?.type ?? null,
        bbox: bboxOfGeometry(feature.geometry),
      };
    }),
  });
}

const report = {
  schema_version: 1,
  purpose: 'Research-only enumeration of archived USSR/Russian Federation vector candidates. Does not promote geometry.',
  reports,
};
fs.writeFileSync('modern-archive-candidates.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
