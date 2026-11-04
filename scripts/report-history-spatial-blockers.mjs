import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const model = JSON.parse(fs.readFileSync(path.join(dataRoot, 'territory-model.json'), 'utf8'));
const certificationFile = path.join(dataRoot, 'completion-certifications.json');
const certifications = fs.existsSync(certificationFile)
  ? JSON.parse(fs.readFileSync(certificationFile, 'utf8'))
  : {spatialChangeCertifications: []};
const certifiedById = new Map();
for (const certification of certifications.spatialChangeCertifications ?? []) {
  const id = certification.changeId;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Missing spatial reconstruction certification changeId');
  }
  if (certifiedById.has(id)) {
    throw new Error(`Duplicate spatial reconstruction certification changeId: ${id}`);
  }
  certifiedById.set(id, certification);
}

const blockers = [];
const certified = [];
const seenChangeIds = new Map();
for (const changeFile of model.changeFiles ?? []) {
  const filePath = path.join(dataRoot, changeFile);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const change of payload.territoryChanges ?? []) {
    // A repeated ID can silently apply one certification to unrelated geometry.
    if (typeof change.id !== 'string' || !change.id.trim()) {
      throw new Error(`Missing territory change ID in ${changeFile}`);
    }
    const previousFile = seenChangeIds.get(change.id);
    if (previousFile) {
      throw new Error(`Duplicate territory change ID ${change.id}: ${previousFile} and ${changeFile}`);
    }
    seenChangeIds.set(change.id, changeFile);
    const isGeometryMutation = change.geometryAction !== 'metadata-only';
    const geometryVerified = change.reviewStatus === 'geometry-verified';
    if (!isGeometryMutation || geometryVerified) continue;
    const cert = certifiedById.get(change.id);
    const row = {
      id: change.id,
      effectiveDate: change.effectiveDate?.normalized ?? null,
      precision: change.effectiveDate?.precision ?? null,
      polityId: change.polityId ?? null,
      track: change.track ?? null,
      operation: change.operation ?? null,
      territorialModel: change.territorialModel ?? null,
      reviewStatus: change.reviewStatus ?? null,
      geometryMethod: change.geometry?.method ?? null,
      evidenceDocumentIds: change.evidenceDocumentIds ?? [],
      sourceFile: changeFile,
    };
    if (cert) {
      certified.push({...row, certification: cert});
      continue;
    }
    blockers.push(row);
  }
}

blockers.sort((a, b) => String(a.effectiveDate ?? '').localeCompare(String(b.effectiveDate ?? '')) || String(a.id).localeCompare(String(b.id)));
certified.sort((a, b) => String(a.effectiveDate ?? '').localeCompare(String(b.effectiveDate ?? '')) || String(a.id).localeCompare(String(b.id)));
const byOperation = Object.fromEntries([...new Set(blockers.map(x => x.operation ?? 'missing'))].sort().map(op => [op, blockers.filter(x => (x.operation ?? 'missing') === op).length]));
const byTrack = Object.fromEntries([...new Set(blockers.map(x => x.track ?? 'missing'))].sort().map(track => [track, blockers.filter(x => (x.track ?? 'missing') === track).length]));

const report = {
  schema_version: 2,
  generatedAt: new Date().toISOString(),
  definition: 'Unresolved spatial blockers exclude geometry-verified changes, metadata-only changes, and changes covered by explicit document-corroborated reconstruction certifications with finite uncertainty.',
  totalSpatialBlockers: blockers.length,
  certifiedReconstructionChanges: certified.length,
  byOperation,
  byTrack,
  blockers,
  certified,
};

const outDir = path.join(dataRoot, 'generated');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'spatial-blockers.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`History spatial blockers: ${blockers.length}; certified reconstruction changes: ${certified.length}`);
for (const blocker of blockers) console.log(`${blocker.effectiveDate ?? 'unknown'}\t${blocker.operation ?? 'missing'}\t${blocker.track ?? 'missing'}\t${blocker.id}\t${blocker.geometryMethod ?? 'missing'}`);
