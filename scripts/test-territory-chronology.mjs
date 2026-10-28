import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {territoryPeriodAt} from '../src/app/territory/territoryChronology.ts';

// Compare the UI's period selection against the independent canonical
// History Core coverage model, not against hard-coded expected UI labels.
const coverage = JSON.parse(readFileSync(new URL(
  '../public/data/history-core/coverage-periods.json', import.meta.url,
), 'utf8'));
const periodAt = (year, month) => coverage.periods.find(period => {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  return key >= period.startMonth && key <= period.endMonth;
});

for (let year = 1917; year <= 1923; year++) {
  for (let month = 1; month <= 12; month++) {
    const expected = periodAt(year, month);
    assert.ok(expected, `canonical coverage missing ${year}-${month}`);
    assert.equal(territoryPeriodAt(year, month).polityId, expected.polityId,
      `territory UI disagrees with History Core for ${year}-${month}`);
  }
}

assert.equal(territoryPeriodAt(1922, 11).polityId, 'rsfsr');
assert.equal(territoryPeriodAt(1922, 12).polityId, 'ussr');
assert.equal(territoryPeriodAt(1922).polityId, 'ussr',
  'legacy year-only callers use the year-end state');
assert.equal(territoryPeriodAt(1917, 1).label, 'Россия в 1917 году',
  'January 1917 must not be called the Russian Republic');
assert.throws(() => territoryPeriodAt(1922, 0), RangeError);
assert.throws(() => territoryPeriodAt(1922, 13), RangeError);

console.log('Territory monthly polity chronology matches canonical History Core for 1917–1923.');
