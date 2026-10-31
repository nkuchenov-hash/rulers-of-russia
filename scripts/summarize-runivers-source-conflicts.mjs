// Research-only summary of Runivers failed-boundary source identities.
// Does not change geometry, reference scope, tolerances, or acceptance gates.
// Never copy raw feature geometry or boundary sample coordinates to artifacts.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Keep public source labels short without collapsing two *different* original
// identifiers that share the displayed prefix. Only scalar source metadata is
// hashed; geometry and sample positions are never included in this identity.
const boundedIdentityString = (value, maxLength) => {
  if (typeof value !== 'string') return null;
  if (value.length <= maxLength) return value;
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 16);
  return value.slice(0, maxLength) + '#sha256=' + digest;
};
const boundedString = value => boundedIdentityString(value, 120);
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const validResourceId = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
// Runivers category IDs can arrive as numbers or decimal strings in source
// metadata. Preserve their identity rather than silently reporting '?' for
// string-encoded IDs; never accept arbitrary objects or unsafe integers.
const validCategoryId = value => validResourceId(value) ?? (
  typeof value === 'string' && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value) : null);
const boundedFeatureId = value => typeof value === 'string' ? boundedIdentityString(value, 160)
  : validResourceId(value) !== null ? String(value) : null;
const safeMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
// Source identity at a sampled hotspot is not automatically the identity at
// the report's global directional maximum. One metre covers JSON rounding,
// NOT a relaxed geographic tolerance or a substitute for a boundary check.
const MAX_SAMPLE_ROUNDING_METERS = 1;

function sourceKey(records) {
  if (!Array.isArray(records) || !records.length) return 'unknown';
  const labels = records.map(record => {
    const cat = validCategoryId(record?.cat);
    const name = boundedString(record?.name);
    // Two polygons can share cat/name/date/status while having different
    // original feature IDs. Do not merge their provenance in conflict triage.
    const featureId = boundedFeatureId(record?.featureId);
    // Identically named source polities may describe different dated
    // territorial acts or political statuses. Grouping only by cat/name
    // silently merges their distinct historical evidence.
    const date = boundedString(record?.lwdate);
    const status = typeof record?.status === 'number' && Number.isFinite(record.status)
      ? String(record.status) : boundedString(record?.status);
    const base = [cat === null ? '?' : cat, name ?? '?'].join(':');
    return base + (featureId !== null ? '#feature=' + featureId : '')
      + (date ? '@' + date : '') + (status !== null ? '#status=' + status : '');
  });
  // Do not truncate the INTERNAL grouping identity: distinct dated records
  // can share the first 500 characters and must never be merged.
  return [...new Set(labels)].sort().join(' | ');
}

// Public diagnostics stay bounded, while a digest distinguishes two full
// source identities whose visible 500-character prefixes happen to match.
// No coordinates, geometry, or original feature payloads enter this digest.
const sourceFingerprint = identity => createHash('sha256').update(identity).digest('hex').slice(0, 16);
const displaySourceIdentity = identity => identity.slice(0, 500);

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
      selectedSourceIdentities: displaySourceIdentity(selected),
      excludedSourceIdentities: displaySourceIdentity(excluded),
      selectedSourceIdentityFingerprint: sourceFingerprint(selected),
      excludedSourceIdentityFingerprint: sourceFingerprint(excluded),
      comparisons: 0,
      // Missing metrics are unknown, not evidence of zero border error.
      maxSymmetricErrorMeters: null,
      maxSymmetricP95Meters: null,
      coincidentSelectedExcludedAtWorstSample: false,
      resourceIds: new Set(),
      historyStateStarts: new Set(),
    };
    current.comparisons += 1;
    const symmetricMax = finiteNonnegative(failure?.symmetricMaxMeters);
    const symmetricP95 = finiteNonnegative(failure?.symmetricP95Meters);
    if (symmetricMax !== null) current.maxSymmetricErrorMeters = Math.max(
      current.maxSymmetricErrorMeters ?? 0, symmetricMax);
    if (symmetricP95 !== null) current.maxSymmetricP95Meters = Math.max(
      current.maxSymmetricP95Meters ?? 0, symmetricP95);
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
    || (b.maxSymmetricErrorMeters ?? -1) - (a.maxSymmetricErrorMeters ?? -1));
  // The two directed border distances describe different failures: a border
  // present in Runivers but absent from History Core, and the reverse. The
  // original source identities at their worst samples may differ entirely.
  // Keep them separate rather than attributing both to the reference side.
  // This is research metadata only: never emit sample positions or geometry.
  const directions = [
    ['runivers-reference', 'referenceToCurrentMaxMeters'],
    ['history-core', 'currentToReferenceMaxMeters'],
  ];
  const directionalGroups = new Map();
  const unattributedByDirection = Object.fromEntries(directions.map(([direction]) => [direction, 0]));
  const unmatchedReportedMaximumByDirection = Object.fromEntries(directions.map(([direction]) => [direction, 0]));
  for (const failure of report.failedComparisons) {
    const samples = Array.isArray(failure?.boundarySampleAttribution)
      ? failure.boundarySampleAttribution : [];
    for (const [direction, metricField] of directions) {
      const worst = samples.filter(sample => sample?.sampledBoundary === direction
        && finiteNonnegative(sample.distanceMeters) !== null)
        .sort((a, b) => b.distanceMeters - a.distanceMeters)[0];
      if (!worst) {
        unattributedByDirection[direction] += 1;
        continue;
      }
      const selected = sourceKey(worst.selectedSourceRecords);
      const excluded = sourceKey(worst.excludedSourceRecords);
      const key = JSON.stringify([direction, selected, excluded]);
      const current = directionalGroups.get(key) ?? {
        sampledBoundary: direction,
        selectedSourceIdentities: displaySourceIdentity(selected),
        excludedSourceIdentities: displaySourceIdentity(excluded),
        selectedSourceIdentityFingerprint: sourceFingerprint(selected),
        excludedSourceIdentityFingerprint: sourceFingerprint(excluded),
        comparisons: 0,
        maxAttributedSampleDistanceMeters: 0,
        maxReportedDirectionalMeters: null,
        reportedMaximumMatches: 0,
        reportedMaximumUnmatched: 0,
        resourceIds: new Set(),
        historyStateStarts: new Set(),
      };
      current.comparisons += 1;
      current.maxAttributedSampleDistanceMeters = Math.max(
        current.maxAttributedSampleDistanceMeters, worst.distanceMeters);
      const reported = finiteNonnegative(failure?.[metricField]);
      if (reported !== null) current.maxReportedDirectionalMeters = Math.max(
        current.maxReportedDirectionalMeters ?? 0, reported);
      const maximumMatches = reported !== null
        && Math.abs(worst.distanceMeters - reported) <= MAX_SAMPLE_ROUNDING_METERS;
      if (maximumMatches) current.reportedMaximumMatches += 1;
      else {
        current.reportedMaximumUnmatched += 1;
        unmatchedReportedMaximumByDirection[direction] += 1;
      }
      const id = validResourceId(failure?.runiversResourceId);
      if (id !== null) current.resourceIds.add(id);
      const month = safeMonth(failure?.historyFirstMonth);
      if (month) current.historyStateStarts.add(month);
      directionalGroups.set(key, current);
    }
  }
  const directionalHotspots = [...directionalGroups.values()].map(group => ({
    ...group,
    resourceIds: [...group.resourceIds].sort((a, b) => a - b),
    historyStateStarts: [...group.historyStateStarts].sort(),
  })).sort((a, b) => b.maxAttributedSampleDistanceMeters - a.maxAttributedSampleDistanceMeters
    || b.comparisons - a.comparisons);

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
    unattributedByDirection,
    unmatchedReportedMaximumByDirection,
    directionalHotspots,
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
