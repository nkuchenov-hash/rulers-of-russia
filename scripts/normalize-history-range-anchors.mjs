import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const territoryIndexFile = path.join(dataRoot, 'generated', 'territory', 'index.json');
const documentsFile = path.join(dataRoot, 'documents.json');
const documentsDir = path.join(dataRoot, 'documents');
const changesDir = path.join(dataRoot, 'territory-changes');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJsonFiles = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => path.join(dir, name))
  : [];

if (!fs.existsSync(territoryIndexFile)) throw new Error(`Missing ${territoryIndexFile}`);
if (!fs.existsSync(documentsFile)) throw new Error(`Missing ${documentsFile}`);

const documents = [...(readJson(documentsFile).documents ?? [])];
for (const file of listJsonFiles(documentsDir)) documents.push(...(readJson(file).documents ?? []));
const documentById = new Map(documents.map(document => [document.id, document]));

const changes = [];
for (const file of listJsonFiles(changesDir)) changes.push(...(readJson(file).territoryChanges ?? []));

const parseRepresentedRange = representedDate => {
  if (representedDate?.precision !== 'range') return null;
  const match = String(representedDate.normalized ?? '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear <= startYear) return null;
  return {startYear, endYear};
};

const explicitMultiYearRangeForSnapshot = snapshot => {
  const anchorYear = Number(String(snapshot.coverageAnchorMonth ?? '').slice(0, 4));
  if (!Number.isInteger(anchorYear)) return null;
  for (const id of snapshot.evidenceDocumentIds ?? []) {
    const range = parseRepresentedRange(documentById.get(id)?.representedDate);
    if (range?.startYear === anchorYear) return {documentId: id, ...range};
  }
  return null;
};

const sameTrackChangeInYear = (snapshot, year) => changes.find(change => {
  if (change.polityId !== snapshot.polityId || change.track !== snapshot.track) return false;
  const normalized = String(change.effectiveDate?.normalized ?? '');
  return normalized === String(year) || normalized.startsWith(`${year}-`);
});

const payload = readJson(territoryIndexFile);
let normalizedCount = 0;
const normalizedSnapshots = [];

for (const snapshot of payload.snapshots ?? []) {
  const anchor = snapshot.coverageAnchorMonth;
  if (!/^\d{4}-12$/.test(anchor ?? '')) continue;
  if (snapshot.reviewStatus !== 'geometry-verified') continue;

  const range = explicitMultiYearRangeForSnapshot(snapshot);
  if (!range) continue;

  const blockingChange = sameTrackChangeInYear(snapshot, range.startYear);
  if (blockingChange) continue;

  snapshot.declaredCoverageAnchorMonth = anchor;
  snapshot.coverageAnchorMonth = `${range.startYear}-01`;
  snapshot.rangeAnchorEvidenceDocumentId = range.documentId;
  snapshot.rangeAnchorNormalization = 'explicit-multi-year-represented-range-with-no-same-track-change-in-first-year';
  normalizedCount += 1;
  normalizedSnapshots.push({
    id: snapshot.id,
    from: anchor,
    to: snapshot.coverageAnchorMonth,
    representedRange: `${range.startYear}/${range.endYear}`,
    evidenceDocumentId: range.documentId,
  });
}

payload.rangeAnchorNormalization = {
  policy: 'Only geometry-verified December-anchored snapshots backed by an explicit multi-year representedDate range may move to January of the first represented year, and only when no same-polity/same-track territorial change exists in that year.',
  normalizedCount,
  normalizedSnapshots,
};

fs.writeFileSync(territoryIndexFile, JSON.stringify(payload));
console.log(`History range anchors normalized: ${normalizedCount} verified snapshots.`);
for (const item of normalizedSnapshots) console.log(`- ${item.id}: ${item.from} -> ${item.to} (${item.representedRange})`);
