import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const coverage = JSON.parse(readFileSync(new URL(
  '../public/data/history-core/coverage-periods.json', import.meta.url,
), 'utf8'));
const index = JSON.parse(readFileSync(new URL(
  '../public/data/history-core/generated/month-index.json', import.meta.url,
), 'utf8'));

assert.equal(index.monthCount, 13980);
assert.equal(index.months.length, 13980);
const seen = new Set();
for (const month of index.months) {
  assert.ok(!seen.has(month.month), `Duplicate month ${month.month}`);
  seen.add(month.month);
  const matches = coverage.periods.filter(period =>
    month.month >= period.startMonth && month.month <= period.endMonth);
  assert.equal(matches.length, 1, `Invalid coverage for ${month.month}`);
  const period = matches[0];
  assert.equal(month.polityId, period.polityId,
    `Geometry lineage changed unexpectedly for ${month.month}`);
  assert.equal(month.politicalPolityId, period.politicalPolityId ?? period.polityId,
    `Political polity disagrees with coverage for ${month.month}`);
  assert.equal(month.label, period.label, `Political label disagrees for ${month.month}`);
}

// Historical title date: 22 October 1721 Julian = 2 November Gregorian.
// The political title changes, but the pre-existing geometry lineage does not.
for (let m = 1; m <= 12; m++) {
  const key = `1721-${String(m).padStart(2, '0')}`;
  const month = index.months.find(item => item.month === key);
  assert.ok(month, `Missing ${key}`);
  assert.equal(month.polityId, 'russian-empire',
    `${key}: title transition must not switch territory geometry lineage`);
  assert.equal(month.politicalPolityId, m <= 10 ? 'russian-tsardom' : 'russian-empire',
    `${key}: incorrect Gregorian month-end political title`);
}

console.log('All 13980 History Core months preserve geometry lineage and explicit political titles; 1721 transition verified.');
