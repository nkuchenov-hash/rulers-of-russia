// Research-only summary of Runivers failed-boundary source identities.
// Does not change geometry, reference scope, tolerances, or acceptance gates.
// Never copy raw feature geometry or boundary sample coordinates to artifacts.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const boundedString = value => typeof value === 'string' ? value.slice(0, 120) : null;
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const validResourceId = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const safeMonth = value => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : null;

function sourceKey(records) {
  if (!Array.isArray(records) || !records.length) return 'unknown';
  const labels = records.map(record => {
    const cat = validResourceId(record?.cat);
    const name = boundedString(record?.name);
    return [cat === null ? '?' : cat, name ?? '?'].join(':');
  });
  return [...new Set(labels)].sort().join(' | ').slice(0, 500);
}

export function summarizeRuniversSourceConflicts(report) {
  if (!report || !Array.isArray(report.failedComparisons)) {
    throw new Error('Runivers report lacks failedComparisons; no source triage can be inferred');
  }
  const groups = new Map();
  let unattributed = 0;
  for (const failure of report.failedComparisons) {
    const samples = Array.isArray(failure?.boundarySampleAttribution)
      ? failure.boundarySampleAttribution : [];
    const worst = samples.filter(sample => sample?.sampledBoundary === 'runivers-reference'
      && finiteNonnegative(sample.distanceMeters) !== null)
      .sort((a, b) => b.distanceMeters - a.distanceMeters)[0];
    if (!worst) unattributed += 1;
    const selected = sourceKey(worst?.selectedSourceRecords);
    const excluded = sourceKey(worst?.excludedSourceRecords);
    const key = JSON.stringify([selected, excluded]);
    const current = groups.get(key) ?? {
      selectedSourceIdentities: selected,
      excludedSourceIdentities: excluded,
      comparisons: 0,
      maxSymmetricErrorMeters: 0,
      maxSymmetricP95Meters: 0,
      coincidentSelectedExcludedAtWorstSample: false,
      resourceIds: new Set(),
      historyStateStarts: new Set(),
    };
    current.comparisons += 1;
    current.maxSymmetricErrorMeters = Math.max(current.maxSymmetricErrorMeters,
      finiteNonnegative(failure?.symmetricMaxMeters) ?? 0);
    current.maxSymmetricP95Meters = Math.max(current.maxSymmetricP95Meters,
      finiteNonnegative(failure?.symmetricP95Meters) ?? 0);
    current.coincidentSelectedExcludedAtWorstSample ||= Boolean(
      worst?.selectedSourceRecordsMatchedCount > 0 && worst?.excludedSourceRecordsMatchedCount > 0);
    const id = validResourceId(failure?.runiversResourceId);
    if (id !== null) current.resourceIds.add(id);
    const month = safeMonth(failure?.historyFirstMonth);
    if (month) current.historyStateStarts.add(month);
    groups.set(key, current);
  }
  const clusters = [...groups.values()].map(group => ({
    ...group,
    resourceIds: [...group.resourceIds].sort((a, b) => a - b),
    historyStateStarts: [...group.historyStateStarts].sort(),
  })).sort((a, b) => b.comparisons - a.comparisons
    || b.maxSymmetricErrorMeters - a.maxSymmetricErrorMeters);
  return {
    schemaVersion: 1,
    diagnosticOnly: true,
    acceptance: 'NOT A GEOGRAPHIC PASS; inspect original sources and legal status',
    auditedRange: {
      startMonth: safeMonth(report.summary?.auditedRange?.startMonth),
      endMonth: safeMonth(report.summary?.auditedRange?.endMonth),
    },
    failedComparisons: report.failedComparisons.length,
    unattributedComparisons: unattributed,
    referenceFailureCount: Array.isArray(report.referenceFailures) ? report.referenceFailures.length : null,
    unmatchedReferenceResourceIds: Array.isArray(report.unmatchedReferenceLayers)
      ? [...new Set(report.unmatchedReferenceLayers.map(row => validResourceId(row?.runiversResourceId))
        .filter(id => id !== null))].sort((a, b) => a - b) : [],
    clusters,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/summarize-runivers-source-conflicts.mjs <report.json>');
    process.exitCode = 2;
  } else {
    const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    process.stdout.write(JSON.stringify(summarizeRuniversSourceConflicts(report), null, 2) + '\n');
  }
}
