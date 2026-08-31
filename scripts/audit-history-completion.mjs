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

const criteria = {
  exactMonthCoverage: monthIndex.complete === true && monthIndex.monthCount === 13980,
  noResearchRequiredEvents: unresolvedEvents.length === 0,
  noResearchRequiredChanges: unresolvedChanges.length === 0,
  noUnresolvedChangeDates: unresolvedDates.length === 0,
  noNotYetGeoreferencedChanges: notYetGeoreferenced.length === 0,
  hasVerifiedAreaBaseStates: baseStates.length > 0 && verifiedAreaFragments.length > 0,
  noMaterializationWarnings: materializationWarnings.length === 0,
  noProvisionalMonths: provisionalMonths.length === 0,
  noForwardProxyMonths: forwardProxyMonths.length === 0,
  allMonthsGeometryVerified: verifiedMonths.length === monthIndex.monthCount,
};
const fullyComplete = Object.values(criteria).every(Boolean);

const audit = {
  schema_version: 1,
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
  unresolved: {
    eventIds: unresolvedEvents.map(item => item.id),
    changeIds: unresolvedChanges.map(item => item.id),
    dateChangeIds: unresolvedDates.map(item => item.id),
    notYetGeoreferencedChangeIds: notYetGeoreferenced.map(item => item.id),
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
