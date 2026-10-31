import fs from 'node:fs';
import path from 'node:path';

const reportFile = path.join(process.cwd(), 'tmp', 'runivers-regression', 'report.json');

if (!fs.existsSync(reportFile)) {
  console.error('Runivers regression report is missing.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const s = report.summary ?? {};
const counters = ['runiversLayersDiscovered','datedLayersAudited','usableReferenceLayers','comparisons','passingComparisons','overrides','failedComparisons','referenceFailures','missingStates','uncoveredMonths'];
for (const name of counters) {
  if (!Number.isInteger(s[name]) || s[name] < 0) {
    console.error(`Runivers report has an invalid or missing ${name} counter.`);
    process.exit(1);
  }
}
// A complete preflight outage is an explicit geographic blocker, even when
// the report has no comparison ledger. Diagnose the source outage before the
// generic missing-evidence check; a fabricated green ledger must not override
// an outage flag in either the shard or the summary.
if (s.externalOutage === true || report.shard?.externalOutage === true) {
  console.error('Runivers verification is incomplete: preflight external-source outage; no independent geographic acceptance is possible.');
  process.exit(1);
}

// A passing count alone is not geographic evidence. The validator must
// publish numeric symmetric-border metrics for every attempted comparison,
// without copying Runivers source polygons or sampled coordinates into CI.
const evidence = report.comparisonEvidence;
if (!Array.isArray(evidence) || evidence.length !== s.comparisons) {
  console.error('Runivers comparison evidence is missing or disagrees with the comparison counter.');
  process.exit(1);
}
const evidenceCounts = {pass: 0, fail: 0, override: 0};
const seenEvidence = new Set();
const comparedResourceIds = new Set();
const evidenceCoveredMonths = new Set();
// A source layer must be checked throughout its own dated overlap with this
// shard. Union coverage across different resources can hide missing
// source/state comparisons, even when every calendar month has *some* pass.
const resourceIntervals = new Map();
const resourceCoveredMonths = new Map();

for (const row of evidence) {
  if (!row || !Object.hasOwn(evidenceCounts, row.status)
    || !Number.isInteger(row.runiversResourceId) || row.runiversResourceId <= 0
    || !Number.isInteger(row.runiversFromYear) || row.runiversFromYear < 1
    || !Number.isInteger(row.runiversToYear) || row.runiversToYear < row.runiversFromYear
    || !['half-open', 'terminal-inclusive'].includes(row.runiversIntervalSemantics)
    || typeof row.historyFirstMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.historyFirstMonth)
    || typeof row.historyLastMonth !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(row.historyLastMonth)
    || typeof row.runiversApproximate !== 'boolean'
    || typeof row.historyGeometryFile !== 'string' || !row.historyGeometryFile
    // A whole-layer union can include neighboring sovereign states and may
    // accidentally match the History Core contour. Numeric distances alone
    // cannot establish that the reference was scoped to the same polity.
    || typeof row.historyPolityId !== 'string' || !row.historyPolityId
    || row.referenceScopeKind !== 'named-polity'
    || row.referenceScopePolityId !== row.historyPolityId
    || !Number.isInteger(row.referenceScopeSelectedFeatures) || row.referenceScopeSelectedFeatures < 1
    || !Number.isInteger(row.referenceScopeTotalFeatures)
    || row.referenceScopeTotalFeatures < row.referenceScopeSelectedFeatures
    || !Number.isInteger(row.referenceSamples) || row.referenceSamples <= 0
    || !Number.isInteger(row.currentSamples) || row.currentSamples <= 0
    || !['symmetricP95Meters', 'symmetricMaxMeters', 'toleranceMeters', 'maxToleranceMeters']
      .every(key => Number.isFinite(row[key]) && row[key] >= 0)
    || row.toleranceMeters === 0 || row.maxToleranceMeters === 0) {
    console.error('Runivers comparison evidence contains an invalid or incomplete metric row.');
    process.exit(1);
  }
  // Both directed measurements are necessary for a bilateral border audit.
  // Recompute the symmetric maxima from the rounded directed values: a
  // substituted or corrupted aggregate must never create a false green pass.
  // The producing validator rounds each direction before serialization.
  const directedFields = [
    'referenceToCurrentP95Meters', 'referenceToCurrentMaxMeters',
    'currentToReferenceP95Meters', 'currentToReferenceMaxMeters',
  ];
  if (!directedFields.every(key => Number.isSafeInteger(row[key]) && row[key] >= 0)
    || row.referenceToCurrentP95Meters > row.referenceToCurrentMaxMeters
    || row.currentToReferenceP95Meters > row.currentToReferenceMaxMeters
    || row.symmetricP95Meters !== Math.max(row.referenceToCurrentP95Meters, row.currentToReferenceP95Meters)
    || row.symmetricMaxMeters !== Math.max(row.referenceToCurrentMaxMeters, row.currentToReferenceMaxMeters)) {
    console.error('Runivers symmetric distances disagree with bilateral directed measurements.');
    process.exit(1);
  }
  // A numeric border metric from another era must not certify this shard.
  // A source interval can start before the History Core state or vice versa,
  // but the two intervals must overlap under Runivers's half-open semantics.
  const shardStart = report.shard?.startMonth;
  const shardEnd = report.shard?.endMonth;
  const historyStartYear = Number(row.historyFirstMonth.slice(0, 4));
  const historyEndYear = Number(row.historyLastMonth.slice(0, 4));
  const sourceLastYear = row.runiversToYear - (row.runiversIntervalSemantics === 'half-open' ? 1 : 0);
  const sourceInterval = JSON.stringify([row.runiversFromYear, row.runiversToYear, row.runiversIntervalSemantics]);
  const earlierInterval = resourceIntervals.get(row.runiversResourceId);
  if (earlierInterval && earlierInterval.identity !== sourceInterval) {
    console.error(`Runivers resource ${row.runiversResourceId} has inconsistent dated interval metadata across comparisons.`);
    process.exit(1);
  }
  if (!earlierInterval) resourceIntervals.set(row.runiversResourceId, {
    identity: sourceInterval, firstYear: row.runiversFromYear, lastYear: sourceLastYear,
  });
  if (row.historyFirstMonth > row.historyLastMonth
    || (shardStart && row.historyFirstMonth < shardStart)
    || (shardEnd && row.historyLastMonth > shardEnd)
    || sourceLastYear < row.runiversFromYear
    || row.runiversFromYear > historyEndYear || sourceLastYear < historyStartYear) {
    console.error('Runivers comparison evidence refers to an out-of-shard or non-overlapping historical interval.');
    process.exit(1);
  }
  // Runivers is year-granular: a state that begins in February or ends in
  // November does NOT supply a complete-year border for those years.
  // Validate the validator's explicit compared-year ledger independently.
  // Otherwise two partial states can stitch twelve months into a false pass.
  const firstFullHistoryYear = historyStartYear + (row.historyFirstMonth.slice(5) === '01' ? 0 : 1);
  const lastFullHistoryYear = historyEndYear - (row.historyLastMonth.slice(5) === '12' ? 0 : 1);
  const expectedFirstYear = Math.max(row.runiversFromYear, firstFullHistoryYear);
  const expectedLastYear = Math.min(sourceLastYear, lastFullHistoryYear);
  if (!Number.isInteger(row.comparedFirstYear) || !Number.isInteger(row.comparedLastYear)
    || row.comparedFirstYear !== expectedFirstYear
    || row.comparedLastYear !== expectedLastYear
    || row.comparedFirstYear > row.comparedLastYear) {
    console.error('Runivers comparison evidence lacks a valid complete-calendar-year source/state overlap.');
    process.exit(1);
  }
  const identity = JSON.stringify([row.runiversResourceId, row.runiversFromYear, row.runiversToYear,
    row.historyFirstMonth, row.historyLastMonth, row.historyGeometryFile]);
  if (seenEvidence.has(identity)) {
    console.error('Runivers comparison evidence repeats a source/state pair instead of independent comparisons.');
    process.exit(1);
  }
  seenEvidence.add(identity);
  comparedResourceIds.add(row.runiversResourceId);
  // A source overlapping a long-lived History Core state in one year does not
  // independently verify the other years of that state. Retain only the
  // calendar-month intersection of the source and the state for coverage.
  const evidenceStart = row.comparedFirstYear * 12;
  const evidenceEnd = row.comparedLastYear * 12 + 11;
  const sourceMonths = resourceCoveredMonths.get(row.runiversResourceId) ?? new Set();
  resourceCoveredMonths.set(row.runiversResourceId, sourceMonths);
  for (let month = evidenceStart; month <= evidenceEnd; month += 1) {
    evidenceCoveredMonths.add(month);
    sourceMonths.add(month);
  }


  // Recompute the original validator tolerance policy from the dated
  // comparison, rather than trusting potentially inflated report numbers.
  // The validator uses the strictest (latest) FULL year in the actual
  // source/state overlap. The compared-year ledger is validated above.
  // A partial final year must never change the tolerance or count as covered.
  const strictestComparisonYear = row.comparedLastYear;
  const expectedTolerance = row.runiversApproximate ? 100000
    : strictestComparisonYear < 1700 ? 50000
      : strictestComparisonYear < 1850 ? 35000
        : strictestComparisonYear < 1900 ? 25000 : 15000;
  if (row.toleranceMeters !== expectedTolerance
    || row.maxToleranceMeters !== expectedTolerance * 4
    || row.symmetricP95Meters > row.symmetricMaxMeters) {
    console.error('Runivers comparison evidence changes the historical distance limits or violates p95/max ordering.');
    process.exit(1);
  }
  const withinLimits = row.symmetricP95Meters <= row.toleranceMeters
    && row.symmetricMaxMeters <= row.maxToleranceMeters;
  if ((row.status === 'pass' && !withinLimits)
    || (row.status !== 'pass' && withinLimits)) {
    console.error('Runivers comparison status disagrees with the unchanged symmetric distance tolerances.');
    process.exit(1);
  }
  evidenceCounts[row.status] += 1;
}
if (evidenceCounts.pass !== s.passingComparisons
  || evidenceCounts.fail !== s.failedComparisons
  || evidenceCounts.override !== s.overrides) {
  console.error('Runivers comparison evidence counts disagree with the summary.');
  process.exit(1);
}

// Every dated layer selected for this shard must be accounted for. A green
// subset is not independent geographic verification of the full interval.
if (s.datedLayersAudited === 0 || s.datedLayersAudited > s.runiversLayersDiscovered) {
  console.error('Runivers report dated-layer coverage is invalid or exceeds discovered layers.');
  process.exit(1);
}
// The shard runner discovers only dated layers overlapping the requested
// calendar interval. Auditing a proper subset cannot certify the whole shard,
// even if every audited layer has a passing comparison.
if (s.datedLayersAudited !== s.runiversLayersDiscovered) {
  console.error(`Runivers regression discovered ${s.runiversLayersDiscovered} overlapping dated layers but audited only ${s.datedLayersAudited}; incomplete reference inventory cannot pass.`);
  process.exit(1);
}
if (s.passingComparisons + s.overrides + s.failedComparisons !== s.comparisons) {
  console.error('Runivers report comparison totals are inconsistent.');
  process.exit(1);
}
// An evidence-backed exception is useful for explaining a disagreement, but
// it is not an independent geometric pass. Never certify a shard by replacing
// failed comparisons with overrides.
if (s.overrides > 0) {
  console.error(`Runivers verification has ${s.overrides} evidence-backed override(s); these are documented disagreements, not passing independent geometry comparisons.`);
  process.exit(1);
}

// Runivers references are year-granular. The shard runner excludes full years
// with within-year transitions, and the validator sees only the filtered index.
// Without this check, a report could be green while entire transition years
// were never compared. They require a separate dated independent check.
// Only the shard runner records how many canonical months were actually
// compared. A standalone validator report lacks that evidence and must not
// be accepted as a complete independent geographic audit.
if (!report.shard || typeof report.shard !== 'object' || Array.isArray(report.shard)) {
  console.error('Runivers shard coverage metadata is missing; full dated geographic coverage cannot be certified.');
  process.exit(1);
}
{
  const {rangeMonthCount, comparedMonthCount, excludedMonthCount} = report.shard;
  if (![rangeMonthCount, comparedMonthCount, excludedMonthCount].every(
    count => Number.isInteger(count) && count >= 0,
  ) || rangeMonthCount === 0 || comparedMonthCount === 0
    || rangeMonthCount !== comparedMonthCount + excludedMonthCount) {
    console.error('Runivers shard month coverage counters are invalid or inconsistent.');
    process.exit(1);
  }
}

const usable = s.usableReferenceLayers;
const comparisons = Number(s.comparisons ?? 0);
const failed = Number(s.failedComparisons ?? 0);
const referenceFailures = Number(s.referenceFailures ?? 0);
const missingStates = Number(s.missingStates ?? 0);
const uncoveredMonths = Number(s.uncoveredMonths ?? 0);

const totalExternalOutage = usable === 0
  && comparisons === 0
  && failed === 0
  && referenceFailures > 0;

if (totalExternalOutage) {
  console.error(`Runivers verification is incomplete: ${referenceFailures} reference exports failed and no comparison was made. An external-source outage cannot pass the geographic readiness gate.`);
  process.exit(1);
}

if (usable === 0) {
  console.error('Runivers regression produced no usable reference geometry without a clear external-export outage.');
  process.exit(1);
}

if (referenceFailures > 0) {
  console.error(`Runivers regression had partial reference availability: ${referenceFailures} export failures. Partial coverage is not accepted.`);
  process.exit(1);
}

if (failed > 0 || missingStates > 0 || uncoveredMonths > 0) {
  console.error(`Runivers regression failed: ${failed} contour failures, ${missingStates} missing states, ${uncoveredMonths} uncovered months.`);
  process.exit(1);
}

// One Runivers resource may be compared to several History Core states, but
// those comparisons still represent only ONE independent reference layer.
// Never let repeated measurements against the same source substitute for
// missing independently exported layers in a green shard.
if (comparedResourceIds.size !== s.usableReferenceLayers) {
  console.error(`Runivers report claims ${s.usableReferenceLayers} usable reference layers but comparison evidence identifies ${comparedResourceIds.size} distinct resource IDs.`);
  process.exit(1);
}

// Do not accept a passing subset when one or more discovered, dated,
// overlapping reference layers never yielded a bilateral comparison.
// Reference-failure and contour-failure diagnostics above take precedence.
if (usable !== s.datedLayersAudited) {
  console.error(`Runivers regression audited ${s.datedLayersAudited} dated reference layers but only ${usable} yielded comparable borders; incomplete layer coverage cannot pass.`);
  process.exit(1);
}

if (comparisons === 0) {
  console.error('Runivers regression had usable reference layers but made zero comparisons.');
  process.exit(1);
}

// A green report for a different date range must not certify this shard.
// Check both its declared dates and the inclusive calendar-month arithmetic;
// a self-consistent but shortened counter pair is not coverage evidence.
const parseMonth = value => {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5));
  return year >= 1 ? year * 12 + month - 1 : null;
};
const shardStart = report.shard.startMonth;
const shardEnd = report.shard.endMonth;
const startOrdinal = parseMonth(shardStart);
const endOrdinal = parseMonth(shardEnd);
if (startOrdinal === null || endOrdinal === null || endOrdinal < startOrdinal
  || s.auditedRange?.startMonth !== shardStart || s.auditedRange?.endMonth !== shardEnd) {
  console.error('Runivers shard date range is invalid or disagrees with the validator audited range.');
  process.exit(1);
}
// The report and its own validator metadata can be mutually consistent while
// both describe the wrong matrix shard. CI supplies the requested dates as an
// independent input; never certify a different interval by self-attestation.
const expectedStart = process.env.RUNIVERS_START_MONTH;
const expectedEnd = process.env.RUNIVERS_END_MONTH;
if (expectedStart !== undefined || expectedEnd !== undefined) {
  if (parseMonth(expectedStart) === null || parseMonth(expectedEnd) === null
    || expectedStart !== shardStart || expectedEnd !== shardEnd) {
    console.error(`Runivers report covers ${shardStart}..${shardEnd}, not the requested shard ${expectedStart ?? '<missing>'}..${expectedEnd ?? '<missing>'}.`);
    process.exit(1);
  }
}
if (report.shard.rangeMonthCount !== endOrdinal - startOrdinal + 1) {
  console.error(`Runivers shard range has ${report.shard.rangeMonthCount} reported months but ${endOrdinal - startOrdinal + 1} calendar months between ${shardStart} and ${shardEnd}.`);
  process.exit(1);
}

if (report.shard.excludedMonthCount > 0) {
  console.error(`Runivers shard excluded ${report.shard.excludedMonthCount}/${report.shard.rangeMonthCount} months in transition/ambiguous years; year-granular comparisons cannot certify complete dated geographic coverage.`);
  process.exit(1);
}

// The validator's uncoveredMonths counter is useful but cannot substitute
// for evidence-based coverage: a comparison with a 1920 reference must not
// certify a 1920–1921 state merely because the state spans both years.
const missingEvidenceMonths = [];
for (let month = startOrdinal; month <= endOrdinal; month += 1) {
  if (!evidenceCoveredMonths.has(month)) {
    const year = Math.floor(month / 12);
    const monthOfYear = month % 12 + 1;
    missingEvidenceMonths.push(`${String(year).padStart(4, '0')}-${String(monthOfYear).padStart(2, '0')}`);
  }
}
if (missingEvidenceMonths.length) {
  console.error(`Runivers comparison evidence does not cover ${missingEvidenceMonths.length}/${report.shard.rangeMonthCount} shard months (first: ${missingEvidenceMonths.slice(0, 3).join(', ')}).`);
  process.exit(1);
}

// Distinct overlapping references must each be tested against every relevant
// full-year History Core state. A pass from source B cannot fill an untested
// year of source A. This check does not alter any geographic tolerance.
for (const [resourceId, interval] of resourceIntervals) {
  const first = Math.max(startOrdinal, interval.firstYear * 12);
  const last = Math.min(endOrdinal, interval.lastYear * 12 + 11);
  const covered = resourceCoveredMonths.get(resourceId);
  let missing = 0, firstMissing = null;
  for (let month = first; month <= last; month += 1) {
    if (covered?.has(month)) continue;
    missing += 1;
    if (firstMissing === null) firstMissing = month;
  }
  if (missing > 0) {
    const firstYear = Math.floor(firstMissing / 12);
    const firstMonth = firstMissing % 12 + 1;
    console.error(`Runivers reference resource ${resourceId} lacks ${missing} dated month(s) of its own shard overlap (first: ${String(firstYear).padStart(4, '0')}-${String(firstMonth).padStart(2, '0')}); other resources cannot substitute for missing comparisons.`);
    process.exit(1);
  }
}

console.log(`Runivers regression accepted: ${comparisons} comparisons, ${Number(s.passingComparisons ?? 0)} passes, ${Number(s.overrides ?? 0)} evidence-backed overrides.`);
