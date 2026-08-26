import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJsonFiles = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => path.join(dir, name))
  : [];

const errors = [];
const warnings = [];
const fail = message => errors.push(message);
const warn = message => warnings.push(message);

const sourcesFile = path.join(dataRoot, 'sources.json');
const documentsFile = path.join(dataRoot, 'documents.json');
if (!fs.existsSync(sourcesFile)) fail('Missing history-core sources.json');
if (!fs.existsSync(documentsFile)) fail('Missing history-core documents.json');

const sourcesPayload = fs.existsSync(sourcesFile) ? readJson(sourcesFile) : {sources: []};
const documentsPayload = fs.existsSync(documentsFile) ? readJson(documentsFile) : {documents: []};
const sources = sourcesPayload.sources ?? [];
const documents = documentsPayload.documents ?? [];
const sourceById = new Map(sources.map(item => [item.id, item]));
const documentById = new Map(documents.map(item => [item.id, item]));
const primaryTiers = new Set([
  'A1-archival-original',
  'A2-official-document-publication',
  'A3-contemporary-official-map',
]);

for (const source of sources) {
  if (!source.id || !source.title || !source.institution || !source.url || !source.tier) {
    fail(`Incomplete source collection: ${source.id ?? '<missing id>'}`);
  }
}

for (const document of documents) {
  if (!document.id || !document.title || !document.url || !document.sourceCollectionId || !document.tier) {
    fail(`Incomplete concrete document: ${document.id ?? '<missing id>'}`);
    continue;
  }
  if (!sourceById.has(document.sourceCollectionId)) {
    fail(`Document ${document.id} references unknown collection ${document.sourceCollectionId}`);
  }
  if (document.tier === 'C-bootstrap-only') {
    fail(`Concrete canonical evidence ${document.id} cannot be C-bootstrap-only`);
  }
  if (!primaryTiers.has(document.tier) && document.tier !== 'B1-russian-academic-interpretation') {
    fail(`Document ${document.id} has unsupported tier ${document.tier}`);
  }
}

function validateEvidence(ownerLabel, ids, requirePrimary = true) {
  if (!Array.isArray(ids) || ids.length === 0) {
    fail(`${ownerLabel} has no concrete evidenceDocumentIds`);
    return;
  }
  let primary = false;
  for (const id of ids) {
    const document = documentById.get(id);
    if (!document) {
      fail(`${ownerLabel} references unknown document ${id}`);
      continue;
    }
    if (primaryTiers.has(document.tier)) primary = true;
  }
  if (requirePrimary && !primary) fail(`${ownerLabel} has no A1/A2/A3 primary evidence`);
}

const eventFiles = listJsonFiles(path.join(dataRoot, 'events'));
for (const file of eventFiles) {
  const payload = readJson(file);
  for (const event of payload.events ?? []) {
    const label = `Event ${event.id ?? '<missing id>'}`;
    if (!event.id || !event.title || !event.kind || !event.date || !event.reviewStatus) {
      fail(`${label} is structurally incomplete`);
      continue;
    }
    if (event.sourceIds) fail(`${label} uses obsolete collection-level sourceIds; cite evidenceDocumentIds instead`);
    if (event.reviewStatus === 'source-verified' || event.reviewStatus === 'geometry-verified') {
      validateEvidence(label, event.evidenceDocumentIds, true);
    }
    if (event.date.precision === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(event.date.normalized ?? '')) {
      fail(`${label} claims day precision without YYYY-MM-DD normalized date`);
    }
    if (event.date.precision === 'month' && !/^\d{4}-\d{2}$/.test(event.date.normalized ?? '')) {
      fail(`${label} claims month precision without YYYY-MM normalized date`);
    }
  }
}

const changeFiles = listJsonFiles(path.join(dataRoot, 'territory-changes'));
for (const file of changeFiles) {
  const payload = readJson(file);
  for (const change of payload.territoryChanges ?? []) {
    const label = `Territory change ${change.id ?? '<missing id>'}`;
    if (!change.id || !change.eventId || !change.polityId || !change.effectiveDate || !change.track || !change.geometry || !change.reviewStatus) {
      fail(`${label} is structurally incomplete`);
      continue;
    }
    if (change.sourceIds) fail(`${label} uses obsolete collection-level sourceIds; cite evidenceDocumentIds instead`);
    validateEvidence(label, change.evidenceDocumentIds, change.reviewStatus !== 'research-required');
    validateEvidence(`${label} geometry`, change.geometry.evidenceDocumentIds, change.reviewStatus === 'geometry-verified');
    if (change.reviewStatus === 'geometry-verified') {
      if (!change.geometry.file) fail(`${label} is geometry-verified but has no geometry file`);
      if (change.geometry.method === 'not-yet-georeferenced') fail(`${label} cannot be geometry-verified while not-yet-georeferenced`);
    }
    if (change.effectiveDate.precision === 'year' || change.effectiveDate.precision === 'circa' || change.effectiveDate.precision === 'range') {
      warn(`${label} cannot generate an exact monthly transition until date precision is resolved`);
    }
  }
}

const snapshotDir = path.join(dataRoot, 'territory-snapshots');
for (const file of listJsonFiles(snapshotDir)) {
  const payload = readJson(file);
  const snapshots = payload.snapshots ?? payload.features ?? [];
  for (const snapshot of snapshots) {
    const properties = snapshot.properties ?? snapshot;
    const label = `Territory snapshot ${properties.id ?? path.basename(file)}`;
    if (properties.reviewStatus !== 'geometry-verified') {
      fail(`${label} is materialized in production snapshot data without geometry-verified status`);
    }
    validateEvidence(label, properties.evidenceDocumentIds, true);
  }
}

if (warnings.length) {
  console.warn(`History Core warnings (${warnings.length}):`);
  for (const message of warnings) console.warn(`- ${message}`);
}

if (errors.length) {
  console.error(`History Core validation failed (${errors.length}):`);
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`History Core validation passed: ${sources.length} source collections, ${documents.length} concrete documents, ${eventFiles.length} event files, ${changeFiles.length} territory-change files.`);
