import fs from 'node:fs';
import path from 'node:path';

const reportFile = path.join(process.cwd(), 'tmp', 'runivers-regression', 'report.json');

if (!fs.existsSync(reportFile)) {
  console.error('Runivers regression report is missing.');
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
const s = report.summary ?? {};
const usable = Number(s.usableReferenceLayers ?? 0);
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
  console.log(`::warning::Runivers live geometry is unavailable (${referenceFailures} reference exports failed). Canonical History Core validation remains authoritative; the live Runivers cross-check produced no comparison and is classified as an external-source outage, not a geometry pass.`);
  process.exit(0);
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
