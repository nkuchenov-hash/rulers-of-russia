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
// A passing count alone is not geographic evidence. The validator must
// publish numeric symmetric-border metrics for every attempted comparison,
// without copying Runivers source polygons or sampled coordinates into CI.
const evidence = report.comparisonEvidence;
if (!Array.isArray(evidence) || evidence.length !== s.comparisons) {
  console.error('Runivers comparison evidence is missing or disagrees with the comparison counter.');
  process.exit(1);
}
const evidenceCounts = {pass: 0, fail: 0, override: 0};
for (const row of evidence) {
  if (!row || !Object.hasOwn(evidenceCounts, row.status)
    || !Number.isInteger(row.runiversResourceId) || row.runiversResourceId <= 0
    || !Number.isInteger(row.runiversFromYear) || row.runiversFromYear < 1
    || typeof row.historyFirstMonth !== 'string' || !/^\\d{4}-(0[1-9]|1[0-2])$/.test(row.historyFirstMonth)
    || typeof row.runiversApproximate !== 'boolean'
    || typeof row.historyGeometryFile !== 'string' || !row.historyGeometryFile
    || !Number.isInteger(row.referenceSamples) || row.referenceSamples <= 0
    || !Number.isInteger(row.currentSamples) || row.currentSamples <= 0
    || !['symmetricP95Meters', 'symmetricMaxMeters', 'toleranceMeters', 'maxToleranceMeters']
      .every(key => Number.isFinite(row[key]) && row[key] >= 0)
    || row.toleranceMeters === 0 || row.maxToleranceMeters === 0) {
    console.error('Runivers comparison evidence contains an invalid or incomplete metric row.');
    process.exit(1);
  }
  // Recompute the original validator tolerance policy from the dated
  // comparison, rather than trusting potentially inflated report numbers.
  const comparisonYear = Math.max(row.runiversFromYear, Number(row.historyFirstMonth.slice(0, 4)));
  const expectedTolerance = row.runiversApproximate ? 100000
    : comparisonYear < 1700 ? 50000
      : comparisonYear < 1850 ? 35000
        : comparisonYear < 1900 ? 25000 : 15000;
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

console.log(`Runivers regression accepted: ${comparisons} comparisons, ${Number(s.passingComparisons ?? 0)} passes, ${Number(s.overrides ?? 0)} evidence-backed overrides.`);
