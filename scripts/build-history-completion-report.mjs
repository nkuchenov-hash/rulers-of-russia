import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).map(name => path.join(dir, name))
  : [];
const flatten = (files, key) => files.flatMap(file => readJson(file)[key] ?? []);

const rootSources = readJson(path.join(dataRoot, 'sources.json')).sources ?? [];
const modularSources = flatten(listJson(path.join(dataRoot, 'sources')), 'sources');
const rootDocuments = readJson(path.join(dataRoot, 'documents.json')).documents ?? [];
const modularDocuments = flatten(listJson(path.join(dataRoot, 'documents')), 'documents');
const events = flatten(listJson(path.join(dataRoot, 'events')), 'events');
const changes = flatten(listJson(path.join(dataRoot, 'territory-changes')), 'territoryChanges');
const model = readJson(path.join(dataRoot, 'territory-model.json'));
const monthIndexFile = path.join(dataRoot, 'generated', 'month-index.json');
const monthIndex = fs.existsSync(monthIndexFile) ? readJson(monthIndexFile) : null;
const verifiedBoundaryFile = path.join(dataRoot, 'generated', 'verified-boundaries.json');
const verifiedBoundaryIndex = fs.existsSync(verifiedBoundaryFile) ? readJson(verifiedBoundaryFile) : {entries: []};
const verifiedBoundaryEntries = verifiedBoundaryIndex.entries ?? [];

const by = (items, field) => Object.fromEntries([...new Set(items.map(x => x[field] ?? 'missing'))]
  .sort()
  .map(value => [value, items.filter(x => (x[field] ?? 'missing') === value).length]));
const precise = item => ['day', 'month'].includes(item?.date?.precision ?? item?.effectiveDate?.precision);
const withEvidence = item => Array.isArray(item.evidenceDocumentIds) && item.evidenceDocumentIds.length > 0;
const finalMonthEnd = monthIndex?.maxMonth ? `${monthIndex.maxMonth}-31` : null;
const activeVerifiedBoundariesAtEnd = finalMonthEnd
  ? verifiedBoundaryEntries.filter(item => item.effectiveFrom <= finalMonthEnd && (!item.effectiveTo || item.effectiveTo >= `${monthIndex.maxMonth}-01`))
  : [];

const report = {
  schema_version: 2,
  generatedAt: new Date().toISOString(),
  definitionOfComplete: {
    monthCoverage: 'Every month from 0862-01 through 2026-12 resolves to a state.',
    documentaryCoverage: 'Every canonical event/change has concrete evidence documents; source collections alone are insufficient.',
    dateCoverage: 'Every geometry-mutating transition has day/month precision or is explicitly represented as uncertainty/range.',
    geometryCoverage: 'Every production boundary mutation is geometry-verified and source-backed; provisional/bootstrap geometry does not count.',
    verifiedBoundaryCoverage: 'Source-defined boundary fragments can be geometry-verified independently of a still-provisional whole-state polygon and must be exposed by the live renderer.',
    uiIntegration: 'Territory UI resolves History Core month state and exposes provenance/confidence plus active geometry-verified boundary fragments.'
  },
  totals: {
    sourceCollections: rootSources.length + modularSources.length,
    concreteDocuments: rootDocuments.length + modularDocuments.length,
    events: events.length,
    territoryChanges: changes.length,
    geometryFragments: (model.fragments ?? []).length,
    geometryVerifiedFragments: (model.fragments ?? []).filter(x => x.reviewStatus === 'geometry-verified').length,
    verifiedBoundaryOverlays: verifiedBoundaryEntries.length,
    activeVerifiedBoundaryOverlaysAtFinalMonth: activeVerifiedBoundariesAtEnd.length,
    baseStates: (model.baseStates ?? []).length,
    replayFiles: (model.changeFiles ?? []).length,
    months: monthIndex?.monthCount ?? null
  },
  events: {
    byReviewStatus: by(events, 'reviewStatus'),
    withConcreteEvidence: events.filter(withEvidence).length,
    preciseDayOrMonth: events.filter(precise).length,
    unresolvedDatePrecision: events.filter(x => !precise(x)).map(x => x.id)
  },
  territoryChanges: {
    byReviewStatus: by(changes, 'reviewStatus'),
    byTrack: by(changes, 'track'),
    withConcreteEvidence: changes.filter(withEvidence).length,
    preciseDayOrMonth: changes.filter(x => ['day', 'month'].includes(x.effectiveDate?.precision)).length,
    geometryVerified: changes.filter(x => x.reviewStatus === 'geometry-verified').length,
    notYetGeoreferenced: changes.filter(x => x.geometry?.method === 'not-yet-georeferenced').length,
    unresolvedDatePrecision: changes.filter(x => !['day', 'month'].includes(x.effectiveDate?.precision)).map(x => x.id)
  },
  verifiedBoundaries: {
    total: verifiedBoundaryEntries.length,
    byPolity: by(verifiedBoundaryEntries, 'polityId'),
    byTrack: by(verifiedBoundaryEntries, 'track'),
    activeAtFinalMonth: activeVerifiedBoundariesAtEnd.map(item => item.id)
  },
  monthCoverage: monthIndex ? {
    complete: monthIndex.complete,
    minMonth: monthIndex.minMonth,
    maxMonth: monthIndex.maxMonth,
    monthCount: monthIndex.monthCount
  } : null
};

const outDir = path.join(dataRoot, 'generated');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'completion-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`History completion: ${report.totals.events} events, ${report.totals.territoryChanges} changes, ${report.totals.geometryVerifiedFragments} verified fragments, ${report.totals.verifiedBoundaryOverlays} verified boundary overlays, ${report.totals.months ?? 'n/a'} months.`);
