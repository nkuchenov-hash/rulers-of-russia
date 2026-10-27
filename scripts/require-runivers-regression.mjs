import fs from 'node:fs';
import path from 'node:path';

const reportFile = path.join(process.cwd(), 'tmp', 'runivers-regression', 'report.json');

if (!fs.existsSync(reportFile)) {
  console.error('Runivers regression report is missing.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const s = report.summary ?? {};
const counters = ['usableReferenceLayers','comparisons','passingComparisons','overrides','failedComparisons','referenceFailures','missingStates','uncoveredMonths'];
for (const name of counters) {
  if (!Number.isInteger(s[name]) || s[name] < 0) {
    console.error(`Runivers report has an invalid or missing ${name} counter.`);
    process.exit(1);
  }
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
  if (excludedMonthCount > 0) {
    console.error(`Runivers shard excluded ${excludedMonthCount}/${rangeMonthCount} months in transition/ambiguous years; year-granular comparisons cannot certify complete dated geographic coverage.`);
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

if (comparisons === 0) {
  console.error('Runivers regression had usable reference layers but made zero comparisons.');
  process.exit(1);
}

console.log(`Runivers regression accepted: ${comparisons} comparisons, ${Number(s.passingComparisons ?? 0)} passes, ${Number(s.overrides ?? 0)} evidence-backed overrides.`);
