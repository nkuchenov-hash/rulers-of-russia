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

const russianLegalContinuityPolities = new Set([
  'grand-principality-of-moscow',
  'russian-tsardom',
  'russian-empire',
  'russian-republic',
  'rsfsr',
  'ussr',
  'russian-federation',
]);

const isPinnedArchiveValidityDocument = document => {
  const archivePath = String(document?.digitalVector?.archivePath ?? '');
  const blob = String(document?.digitalVector?.gitBlobSha1 ?? '');
  return archivePath.startsWith('public/data/territory/archive/') && /^[0-9a-f]{40}$/i.test(blob);
};

const parseRepresentedRange = document => {
  const representedDate = document?.representedDate;
  const match = String(representedDate?.normalized ?? '').match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || endYear < startYear) return null;

  // Multi-year ranges are already explicit temporal ranges.
  if (endYear > startYear && representedDate?.precision === 'range') {
    return {startYear, endYear, intervalKind: 'explicit-multi-year-range'};
  }

  // Cliopatria/Seshat archive features carry start_date/end_date validity fields. When both
  // fields equal the same year, our document layer serializes that as YYYY/YYYY with year
  // precision. It is still an explicit full-year validity interval in the pinned source,
  // not an instantaneous December observation. Restrict this interpretation to exact pinned
  // project archive vectors so ordinary year-only historical dates are never backdated.
  if (endYear === startYear && representedDate?.precision === 'year' && isPinnedArchiveValidityDocument(document)) {
    return {startYear, endYear, intervalKind: 'pinned-same-year-archive-validity'};
  }

  return null;
};

const explicitRepresentedIntervalForSnapshot = snapshot => {
  const anchorYear = Number(String(snapshot.coverageAnchorMonth ?? '').slice(0, 4));
  if (!Number.isInteger(anchorYear)) return null;
  for (const id of snapshot.evidenceDocumentIds ?? []) {
    const document = documentById.get(id);
    const range = parseRepresentedRange(document);
    if (range?.startYear === anchorYear) return {documentId: id, ...range};
  }
  return null;
};

const isContinuousRussianLegalTrack = (snapshot, change) => (
  snapshot.track === 'russian-legal-border'
  && change.track === 'russian-legal-border'
  && russianLegalContinuityPolities.has(snapshot.polityId)
  && russianLegalContinuityPolities.has(change.polityId)
);

const sameTrackChangeInYear = (snapshot, year) => changes.find(change => {
  if (change.track !== snapshot.track) return false;
  const samePolity = change.polityId === snapshot.polityId;
  if (!samePolity && !isContinuousRussianLegalTrack(snapshot, change)) return false;
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

  const range = explicitRepresentedIntervalForSnapshot(snapshot);
  if (!range) continue;

  const blockingChange = sameTrackChangeInYear(snapshot, range.startYear);
  if (blockingChange) continue;

  snapshot.declaredCoverageAnchorMonth = anchor;
  snapshot.coverageAnchorMonth = `${range.startYear}-01`;
  snapshot.rangeAnchorEvidenceDocumentId = range.documentId;
  snapshot.rangeAnchorNormalization = range.intervalKind === 'pinned-same-year-archive-validity'
    ? 'pinned-same-year-archive-validity-with-no-continuous-track-change-in-year'
    : 'explicit-multi-year-represented-range-with-no-continuous-track-change-in-first-year';
  normalizedCount += 1;
  normalizedSnapshots.push({
    id: snapshot.id,
    from: anchor,
    to: snapshot.coverageAnchorMonth,
    representedRange: `${range.startYear}/${range.endYear}`,
    intervalKind: range.intervalKind,
    evidenceDocumentId: range.documentId,
  });
}

payload.rangeAnchorNormalization = {
  policy: 'A geometry-verified December-anchored snapshot may move to January only when its evidence explicitly represents a source validity interval beginning in that year and no territorial change exists in that year on the same polity/track or across the continuous Russian legal-border succession. Multi-year representedDate ranges qualify directly. Same-year YYYY/YYYY intervals qualify only for exact pinned project archive vectors whose source start_date/end_date fields define validity, never for ordinary year-only dates.',
  normalizedCount,
  normalizedSnapshots,
};

fs.writeFileSync(territoryIndexFile, JSON.stringify(payload));
console.log(`History range anchors normalized: ${normalizedCount} verified snapshots.`);
for (const item of normalizedSnapshots) console.log(`- ${item.id}: ${item.from} -> ${item.to} (${item.representedRange}; ${item.intervalKind})`);
