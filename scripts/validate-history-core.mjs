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
const sourcesDir = path.join(dataRoot, 'sources');
const documentsFile = path.join(dataRoot, 'documents.json');
const documentsDir = path.join(dataRoot, 'documents');
const territoryModelFile = path.join(dataRoot, 'territory-model.json');
if (!fs.existsSync(sourcesFile)) fail('Missing history-core sources.json');
if (!fs.existsSync(documentsFile)) fail('Missing history-core documents.json');
if (!fs.existsSync(territoryModelFile)) fail('Missing history-core territory-model.json');

const rootSourcesPayload = fs.existsSync(sourcesFile) ? readJson(sourcesFile) : {sources: []};
const sourceFiles = listJsonFiles(sourcesDir);
const sources = [...(rootSourcesPayload.sources ?? [])];
for (const file of sourceFiles) sources.push(...(readJson(file).sources ?? []));
const sourceById = new Map();
for (const source of sources) {
  if (sourceById.has(source.id)) fail(`Duplicate source collection id ${source.id}`);
  sourceById.set(source.id, source);
}

const rootDocumentsPayload = fs.existsSync(documentsFile) ? readJson(documentsFile) : {documents: []};
const documentFiles = listJsonFiles(documentsDir);
const documents = [...(rootDocumentsPayload.documents ?? [])];
for (const file of documentFiles) documents.push(...(readJson(file).documents ?? []));
const territoryModel = fs.existsSync(territoryModelFile) ? readJson(territoryModelFile) : {fragments: [], baseStates: [], changeFiles: []};
const documentById = new Map();
for (const document of documents) {
  if (documentById.has(document.id)) fail(`Duplicate concrete document id ${document.id}`);
  documentById.set(document.id, document);
}
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

function validatePreciseDate(ownerLabel, date) {
  if (!date) { fail(`${ownerLabel} has no date`); return false; }
  if (date.precision === 'day') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.normalized ?? '')) {
      fail(`${ownerLabel} claims day precision without YYYY-MM-DD normalized date`);
      return false;
    }
    return true;
  }
  if (date.precision === 'month') {
    if (!/^\d{4}-\d{2}$/.test(date.normalized ?? '')) {
      fail(`${ownerLabel} claims month precision without YYYY-MM normalized date`);
      return false;
    }
    return true;
  }
  return false;
}

const eventFiles = listJsonFiles(path.join(dataRoot, 'events'));
const eventIds = new Set();
for (const file of eventFiles) {
  const payload = readJson(file);
  for (const event of payload.events ?? []) {
    const label = `Event ${event.id ?? '<missing id>'}`;
    if (!event.id || !event.title || !event.kind || !event.date || !event.reviewStatus) {
      fail(`${label} is structurally incomplete`);
      continue;
    }
    if (eventIds.has(event.id)) fail(`Duplicate event id ${event.id}`);
    eventIds.add(event.id);
    if (event.sourceIds) fail(`${label} uses obsolete collection-level sourceIds; cite evidenceDocumentIds instead`);
    if (event.reviewStatus === 'source-verified' || event.reviewStatus === 'geometry-verified') {
      validateEvidence(label, event.evidenceDocumentIds, true);
    }
    if (event.date.precision === 'day' || event.date.precision === 'month') validatePreciseDate(label, event.date);
  }
}

const fragmentById = new Map();
for (const fragment of territoryModel.fragments ?? []) {
  const label = `Territory fragment ${fragment.id ?? '<missing id>'}`;
  if (!fragment.id || !fragment.polityId || !fragment.track || !fragment.role || !fragment.territorialModel || !fragment.geometryFile || !fragment.reviewStatus || !fragment.confidence) {
    fail(`${label} is structurally incomplete`);
    continue;
  }
  if (fragmentById.has(fragment.id)) fail(`Duplicate territory fragment id ${fragment.id}`);
  fragmentById.set(fragment.id, fragment);
  validateEvidence(label, fragment.evidenceDocumentIds, fragment.reviewStatus === 'geometry-verified');
  if (fragment.reviewStatus === 'geometry-verified') {
    const file = path.join(dataRoot, fragment.geometryFile);
    if (!fs.existsSync(file)) fail(`${label} geometry file does not exist: ${fragment.geometryFile}`);
  }
}

for (const base of territoryModel.baseStates ?? []) {
  const label = `Territory base ${base.id ?? '<missing id>'}`;
  if (!base.id || !base.polityId || !base.track || !base.territorialModel || base.reviewStatus !== 'geometry-verified') {
    fail(`${label} is structurally incomplete or not geometry-verified`);
    continue;
  }
  validateEvidence(label, base.evidenceDocumentIds, true);
  if (base.coverageAnchorMonth !== undefined) {
    if (!/^\d{4}-\d{2}$/.test(base.coverageAnchorMonth ?? '')) fail(`${label} has invalid coverageAnchorMonth; expected YYYY-MM`);
    const month = Number(String(base.coverageAnchorMonth).slice(5, 7));
    if (month < 1 || month > 12) fail(`${label} has invalid coverage anchor month`);
    if (!base.historicalDate?.normalized || !base.historicalDate?.precision) fail(`${label} uses a coverage anchor but has no explicit historicalDate`);
    if (base.effectiveDate) fail(`${label} must not mix coverageAnchorMonth with a fabricated precise effectiveDate`);
  } else if (!validatePreciseDate(label, base.effectiveDate)) {
    fail(`${label} must have either a coverageAnchorMonth plus historicalDate or a day/month precise effectiveDate for deterministic replay`);
  }
  if (!Array.isArray(base.geometryFragmentIds) || base.geometryFragmentIds.length === 0) fail(`${label} has no geometryFragmentIds`);
  for (const id of base.geometryFragmentIds ?? []) {
    const fragment = fragmentById.get(id);
    if (!fragment) fail(`${label} references unknown fragment ${id}`);
    else if (fragment.reviewStatus !== 'geometry-verified') fail(`${label} references unverified fragment ${id}`);
  }
}

const declaredChangeFiles = new Set(territoryModel.changeFiles ?? []);
for (const relative of declaredChangeFiles) {
  if (!fs.existsSync(path.join(dataRoot, relative))) fail(`Territory model references missing change file ${relative}`);
}

const changeFiles = listJsonFiles(path.join(dataRoot, 'territory-changes'));
const changeIds = new Set();
for (const file of changeFiles) {
  const relative = path.relative(dataRoot, file).replaceAll('\\', '/');
  if (!declaredChangeFiles.has(relative)) warn(`Territory change file ${relative} exists but is not replayed by territory-model.json`);
  const payload = readJson(file);
  for (const change of payload.territoryChanges ?? []) {
    const label = `Territory change ${change.id ?? '<missing id>'}`;
    if (!change.id || !change.eventId || !change.polityId || !change.effectiveDate || !change.track || !change.geometry || !change.reviewStatus) {
      fail(`${label} is structurally incomplete`);
      continue;
    }
    if (changeIds.has(change.id)) fail(`Duplicate territory change id ${change.id}`);
    changeIds.add(change.id);
    if (!eventIds.has(change.eventId)) fail(`${label} references unknown event ${change.eventId}`);
    if (change.sourceIds) fail(`${label} uses obsolete collection-level sourceIds; cite evidenceDocumentIds instead`);
    validateEvidence(label, change.evidenceDocumentIds, change.reviewStatus !== 'research-required');
    validateEvidence(`${label} geometry`, change.geometry.evidenceDocumentIds, change.reviewStatus === 'geometry-verified');
    if (change.reviewStatus === 'geometry-verified') {
      validatePreciseDate(label, change.effectiveDate);
      if (change.geometry.method === 'not-yet-georeferenced') fail(`${label} cannot be geometry-verified while not-yet-georeferenced`);
      const action = change.geometryAction ?? (['acquire', 'unite', 'occupy'].includes(change.operation) ? 'add' : ['cede', 'separate', 'withdraw'].includes(change.operation) ? 'remove' : change.operation === 'replace-state' ? 'replace' : 'metadata-only');
      if (action !== 'metadata-only' && (!Array.isArray(change.geometryFragmentIds) || change.geometryFragmentIds.length === 0)) {
        fail(`${label} mutates geometry but has no geometryFragmentIds`);
      }
      for (const id of change.geometryFragmentIds ?? []) {
        const fragment = fragmentById.get(id);
        if (!fragment) fail(`${label} references unknown fragment ${id}`);
        else if (fragment.reviewStatus !== 'geometry-verified') fail(`${label} references unverified fragment ${id}`);
      }
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

console.log(`History Core validation passed: ${sources.length} source collections across ${1 + sourceFiles.length} source files, ${documents.length} concrete documents across ${1 + documentFiles.length} document files, ${eventFiles.length} event files, ${changeFiles.length} territory-change files, ${fragmentById.size} geometry fragments.`);
