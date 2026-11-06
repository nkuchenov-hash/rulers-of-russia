import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
// Never leave a previous successful audit report available after a failed run.
// Consumers must not mistake stale zero-blocker output for current validation.
const reportPath = path.join(dataRoot, 'generated', 'spatial-blockers.json');
fs.rmSync(reportPath, {force: true});
const model = JSON.parse(fs.readFileSync(path.join(dataRoot, 'territory-model.json'), 'utf8'));
const certificationFile = path.join(dataRoot, 'completion-certifications.json');
if (!fs.existsSync(certificationFile)) {
  throw new Error('Missing completion-certifications.json: cannot audit spatial reconstruction certificates');
}
const certifications = JSON.parse(fs.readFileSync(certificationFile, 'utf8'));
// Malformed or absent input arrays must not yield a misleading zero-blocker report.
if (!Array.isArray(model.changeFiles) || model.changeFiles.length === 0 ||
    model.changeFiles.some(file => typeof file !== 'string' || !file.trim())) {
  throw new Error('Invalid territory model changeFiles: expected non-empty file paths');
}
// Only unique JSON files inside the history-core data root may supply changes.
// Duplicate paths can duplicate records; parent traversal can read unrelated files.
const seenChangeFiles = new Set();
for (const changeFile of model.changeFiles) {
  if (path.posix.isAbsolute(changeFile) || path.win32.isAbsolute(changeFile) ||
      changeFile.includes('\\') || changeFile.split('/').some(part => part === '..' || part === '.' || !part) ||
      path.posix.extname(changeFile) !== '.json') {
    throw new Error(`Invalid territory model changeFile path: ${changeFile}`);
  }
  if (seenChangeFiles.has(changeFile)) {
    throw new Error(`Duplicate territory model changeFile path: ${changeFile}`);
  }
  seenChangeFiles.add(changeFile);
}
if (!Array.isArray(certifications.spatialChangeCertifications)) {
  throw new Error('Invalid spatialChangeCertifications: expected an array');
}
const certifiedById = new Map();
for (const certification of certifications.spatialChangeCertifications ?? []) {
  if (!certification || typeof certification !== 'object' || Array.isArray(certification)) {
    throw new Error('Invalid spatial reconstruction certification record: expected an object');
  }
  const id = certification.changeId;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Missing spatial reconstruction certification changeId');
  }
  if (id !== id.trim()) {
    throw new Error(`Non-canonical spatial reconstruction certification changeId: ${JSON.stringify(id)}`);
  }
  if (certifiedById.has(id)) {
    throw new Error(`Duplicate spatial reconstruction certification changeId: ${id}`);
  }
  // A certificate must never hide an unresolved geometry change without
  // a finite uncertainty envelope and at least one documentary reference.
  if (!Number.isFinite(certification.uncertaintyMeters) || certification.uncertaintyMeters <= 0) {
    throw new Error(`Invalid spatial reconstruction uncertaintyMeters for ${id}`);
  }
  if (!Array.isArray(certification.evidenceDocumentIds) ||
      certification.evidenceDocumentIds.length === 0 ||
      certification.evidenceDocumentIds.some(doc => typeof doc !== 'string' || !doc.trim())) {
    throw new Error(`Missing spatial reconstruction evidenceDocumentIds for ${id}`);
  }
  certifiedById.set(id, certification);
}

const blockers = [];
const certified = [];
const seenChangeIds = new Map();
const seenResolvedChangeFiles = new Map();
const seenFileIdentities = new Map();
let totalTerritoryChanges = 0;
let metadataOnlyChanges = 0;
let geometryVerifiedChanges = 0;
for (const changeFile of model.changeFiles ?? []) {
  const filePath = path.join(dataRoot, changeFile);
  // Lexical path checks do not catch symlinks pointing outside the data root.
  const resolvedRoot = fs.realpathSync(dataRoot);
  const resolvedFile = fs.realpathSync(filePath);
  if (!resolvedFile.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Territory changeFile resolves outside history-core data root: ${changeFile}`);
  }
  // Distinct manifest paths can resolve to the same file via symlinks.
  // Reject aliases rather than counting the same historical changes twice.
  const previousAlias = seenResolvedChangeFiles.get(resolvedFile);
  if (previousAlias) {
    throw new Error(`Duplicate resolved territory changeFile: ${previousAlias} and ${changeFile}`);
  }
  seenResolvedChangeFiles.set(resolvedFile, changeFile);
  // Hard links have different realpaths but refer to the same physical file.
  // Without this check the manifest could count one source twice.
  const stat = fs.statSync(resolvedFile);
  const identity = `${stat.dev}:${stat.ino}`;
  const previousHardlink = seenFileIdentities.get(identity);
  if (previousHardlink) {
    throw new Error(`Duplicate physical territory changeFile: ${previousHardlink} and ${changeFile}`);
  }
  seenFileIdentities.set(identity, changeFile);
  const payload = JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
  if (!Array.isArray(payload.territoryChanges)) {
    throw new Error(`Invalid territoryChanges array in ${changeFile}`);
  }
  totalTerritoryChanges += payload.territoryChanges.length;
  for (const change of payload.territoryChanges) {
    if (!change || typeof change !== 'object' || Array.isArray(change)) {
      throw new Error(`Invalid territory change record in ${changeFile}: expected an object`);
    }
    // A repeated ID can silently apply one certification to unrelated geometry.
    if (typeof change.id !== 'string' || !change.id.trim()) {
      throw new Error(`Missing territory change ID in ${changeFile}`);
    }
    if (change.id !== change.id.trim()) {
      throw new Error(`Non-canonical territory change ID in ${changeFile}: ${JSON.stringify(change.id)}`);
    }
    const previousFile = seenChangeIds.get(change.id);
    if (previousFile) {
      throw new Error(`Duplicate territory change ID ${change.id}: ${previousFile} and ${changeFile}`);
    }
    seenChangeIds.set(change.id, changeFile);
    const isGeometryMutation = change.geometryAction !== 'metadata-only';
    const geometryVerified = change.reviewStatus === 'geometry-verified';
    if (!isGeometryMutation) {
      metadataOnlyChanges++;
      continue;
    }
    if (geometryVerified) {
      geometryVerifiedChanges++;
      continue;
    }
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

// An entirely empty set of change records must not masquerade as a clean audit.
if (totalTerritoryChanges === 0) {
  throw new Error('No territory changes found across model changeFiles: cannot certify a zero-blocker audit');
}

// A stale or misspelled certificate must not silently disappear from the audit.
// Every certification must refer to a present, unresolved geometry mutation.
const accountedCertifiedIds = new Set(certified.map(row => row.id));
for (const id of certifiedById.keys()) {
  if (!accountedCertifiedIds.has(id)) {
    throw new Error(`Spatial reconstruction certificate does not match an unresolved geometry change: ${id}`);
  }
}

blockers.sort((a, b) => String(a.effectiveDate ?? '').localeCompare(String(b.effectiveDate ?? '')) || String(a.id).localeCompare(String(b.id)));
certified.sort((a, b) => String(a.effectiveDate ?? '').localeCompare(String(b.effectiveDate ?? '')) || String(a.id).localeCompare(String(b.id)));
const byOperation = Object.fromEntries([...new Set(blockers.map(x => x.operation ?? 'missing'))].sort().map(op => [op, blockers.filter(x => (x.operation ?? 'missing') === op).length]));
const byTrack = Object.fromEntries([...new Set(blockers.map(x => x.track ?? 'missing'))].sort().map(track => [track, blockers.filter(x => (x.track ?? 'missing') === track).length]));

const report = {
  schema_version: 2,
  generatedAt: new Date().toISOString(),
  definition: 'Unresolved spatial blockers exclude geometry-verified changes, metadata-only changes, and changes with declared reconstruction certifications. Certificate evidenceDocumentIds and uncertaintyMeters are checked for presence and validity of shape only; this report does not independently verify documentary evidence, historical boundary accuracy, or the stated uncertainty.',
  totalTerritoryChanges,
  metadataOnlyChanges,
  geometryVerifiedChanges,
  totalSpatialBlockers: blockers.length,
  certifiedReconstructionChanges: certified.length,
  byOperation,
  byTrack,
  blockers,
  certified,
};

if (metadataOnlyChanges + geometryVerifiedChanges + blockers.length + certified.length !== totalTerritoryChanges) {
  throw new Error('Spatial audit accounting mismatch: territory changes not fully classified');
}

const outDir = path.join(dataRoot, 'generated');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

console.log(`History spatial blockers: ${blockers.length}; certified reconstruction changes: ${certified.length}`);
for (const blocker of blockers) console.log(`${blocker.effectiveDate ?? 'unknown'}\t${blocker.operation ?? 'missing'}\t${blocker.track ?? 'missing'}\t${blocker.id}\t${blocker.geometryMethod ?? 'missing'}`);
