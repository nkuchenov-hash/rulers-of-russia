import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const listJson = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => path.join(dir, name))
  : [];
const flatten = (files, key) => files.flatMap(file => readJson(file)[key] ?? []);

const events = flatten(listJson(path.join(dataRoot, 'events')), 'events');
const changes = flatten(listJson(path.join(dataRoot, 'territory-changes')), 'territoryChanges');
const model = readJson(path.join(dataRoot, 'territory-model.json'));
const monthIndex = readJson(path.join(dataRoot, 'generated', 'month-index.json'));
const territoryIndex = readJson(path.join(dataRoot, 'generated', 'territory', 'index.json'));
const boundaryIndex = readJson(path.join(dataRoot, 'generated', 'verified-boundaries.json'));

const incompleteStatuses = new Set(['research-required', 'source-located']);
const unresolvedEvents = events.filter(item => incompleteStatuses.has(item.reviewStatus));
const unresolvedChanges = changes.filter(item => incompleteStatuses.has(item.reviewStatus));
const unresolvedDates = changes.filter(item => !['day', 'month'].includes(item.effectiveDate?.precision));
const notYetGeoreferenced = changes.filter(item => item.geometry?.method === 'not-yet-georeferenced');
const geometryVerifiedChanges = changes.filter(item => item.reviewStatus === 'geometry-verified');
const sourceVerifiedChanges = changes.filter(item => item.reviewStatus === 'source-verified');

// A source-verified change that is not geometry-verified must make its spatial semantics explicit.
// Only an explicit geometryAction=metadata-only may remain documentary-only at completion time.
// This prevents a territorial acquire/cede/replace event from disappearing from replay merely
// because its geometry method has a different name than `not-yet-georeferenced`.
const unclassifiedSourceVerifiedChanges = sourceVerifiedChanges.filter(item => item.geometryAction !== 'metadata-only');

const fragments = model.fragments ?? [];
const baseStates = model.baseStates ?? [];
const areaFragments = fragments.filter(item => item.role === 'territory-area');
const verifiedAreaFragments = areaFragments.filter(item => item.reviewStatus === 'geometry-verified');
const snapshots = territoryIndex.snapshots ?? [];
const materializationWarnings = territoryIndex.warnings ?? [];
const months = monthIndex.months ?? [];
const provisionalMonths = months.filter(item => item.status === 'reconstruction-provisional');
const forwardProxyMonths = months.filter(item => item.forwardProxy === true);
const verifiedMonths = months.filter(item => item.status === 'geometry-verified');

const countBy = (items, getter) => Object.fromEntries(
  [...items.reduce((map, item) => {
    const key = getter(item) ?? 'unspecified';
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => String(a).localeCompare(String(b))),
);
const changeSummary = item => ({
  id: item.id,
  polityId: item.polityId ?? null,
  effectiveDate: item.effectiveDate?.normalized ?? null,
  operation: item.operation ?? null,
  territorialModel: item.territorialModel ?? null,
  geometryMethod: item.geometry?.method ?? null,
  geometryAction: item.geometryAction ?? null,
  evidenceDocumentIds: item.evidenceDocumentIds ?? [],
});

const criteria = {
  exactMonthCoverage: monthIndex.complete === true && monthIndex.monthCount === 13980,
  noResearchRequiredEvents: unresolvedEvents.length === 0,
  noResearchRequiredChanges: unresolvedChanges.length === 0,
  noUnresolvedChangeDates: unresolvedDates.length === 0,
  noNotYetGeoreferencedChanges: notYetGeoreferenced.length === 0,
  noUnclassifiedSourceVerifiedChanges: unclassifiedSourceVerifiedChanges.length === 0,
  hasVerifiedAreaBaseStates: baseStates.length > 0 && verifiedAreaFragments.length > 0,
  noMaterializationWarnings: materializationWarnings.length === 0,
  noProvisionalMonths: provisionalMonths.length === 0,
  noForwardProxyMonths: forwardProxyMonths.length === 0,
  allMonthsGeometryVerified: verifiedMonths.length === monthIndex.monthCount,
};
const fullyComplete = Object.values(criteria).every(Boolean);

const audit = {
  schema_version: 2,
  generatedAt: new Date().toISOString(),
  fullyComplete,
  criteria,
  counts: {
    events: events.length,
    territoryChanges: changes.length,
    sourceVerifiedChanges: sourceVerifiedChanges.length,
    geometryVerifiedChanges: geometryVerifiedChanges.length,
    researchRequiredEvents: unresolvedEvents.length,
    researchRequiredChanges: unresolvedChanges.length,
    unresolvedChangeDates: unresolvedDates.length,
    notYetGeoreferencedChanges: notYetGeoreferenced.length,
    unclassifiedSourceVerifiedChanges: unclassifiedSourceVerifiedChanges.length,
    geometryFragments: fragments.length,
    territoryAreaFragments: areaFragments.length,
    geometryVerifiedTerritoryAreaFragments: verifiedAreaFragments.length,
    baseStates: baseStates.length,
    materializedSnapshots: snapshots.length,
    materializationWarnings: materializationWarnings.length,
    verifiedBoundaryOverlays: (boundaryIndex.entries ?? []).length,
    months: monthIndex.monthCount,
    geometryVerifiedMonths: verifiedMonths.length,
    provisionalMonths: provisionalMonths.length,
    forwardProxyMonths: forwardProxyMonths.length,
    provisionalGeometryStates: monthIndex.provisionalStateCount ?? null,
  },
  blockerBreakdown: {
    unclassifiedSourceVerifiedByOperation: countBy(unclassifiedSourceVerifiedChanges, item => item.operation),
    unclassifiedSourceVerifiedByGeometryMethod: countBy(unclassifiedSourceVerifiedChanges, item => item.geometry?.method),
    unclassifiedSourceVerifiedByPolity: countBy(unclassifiedSourceVerifiedChanges, item => item.polityId),
    notYetGeoreferencedByOperation: countBy(notYetGeoreferenced, item => item.operation),
    notYetGeoreferencedByPolity: countBy(notYetGeoreferenced, item => item.polityId),
    forwardProxyByCoveragePeriod: countBy(forwardProxyMonths, item => item.coveragePeriodId),
    provisionalByCoveragePeriod: countBy(provisionalMonths, item => item.coveragePeriodId),
  },
  unresolved: {
    eventIds: unresolvedEvents.map(item => item.id),
    changeIds: unresolvedChanges.map(item => item.id),
    dateChangeIds: unresolvedDates.map(item => item.id),
    notYetGeoreferencedChangeIds: notYetGeoreferenced.map(item => item.id),
    unclassifiedSourceVerifiedChangeIds: unclassifiedSourceVerifiedChanges.map(item => item.id),
    notYetGeoreferencedChanges: notYetGeoreferenced.map(changeSummary),
    unclassifiedSourceVerifiedChanges: unclassifiedSourceVerifiedChanges.map(changeSummary),
    forwardProxyMonths: forwardProxyMonths.map(item => ({
      month: item.month,
      polityId: item.polityId ?? null,
      coveragePeriodId: item.coveragePeriodId ?? null,
      provisionalStateId: item.provisionalStateId ?? null,
    })),
    materializationWarnings,
  },
};

const outFile = path.join(dataRoot, 'generated', 'completion-audit.json');
fs.writeFileSync(outFile, JSON.stringify(audit, null, 2) + '\n');

console.log('HISTORY_COMPLETION_AUDIT');
console.log(JSON.stringify(audit, null, 2));
if (process.argv.includes('--require-complete') && !fullyComplete) {
  throw new Error('History Core is not fully complete. See completion-audit.json and the audit above.');
}
