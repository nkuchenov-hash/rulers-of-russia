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

for (const [first, last] of [[1720, 1722], [1917, 1923]]) {
  for (let year = first; year <= last; year++) {
    for (let month = 1; month <= 12; month++) {
      const expected = periodAt(year, month);
      assert.ok(expected, `canonical coverage missing ${year}-${month}`);
      assert.equal(territoryPeriodAt(year, month).polityId,
        expected.politicalPolityId ?? expected.polityId,
        `territory UI political title disagrees with History Core for ${year}-${month}`);
    }
  }
}

// Independent date assertion: 22 October 1721 Julian = 2 November Gregorian.
// The timeline displays the polity at the END of the selected Gregorian month.
for (let month = 1; month <= 10; month++) {
  assert.equal(territoryPeriodAt(1721, month).polityId, 'russian-tsardom',
    `1721-${month}: imperial title not yet accepted (Gregorian)`);
  assert.equal(periodAt(1721, month)?.politicalPolityId, 'russian-tsardom',
    `1721-${month}: canonical political title prematurely labels Empire`);
  assert.equal(periodAt(1721, month)?.polityId, 'russian-empire',
    `1721-${month}: geometry lineage must remain unchanged by title correction`);
}
for (const month of [11, 12]) {
  assert.equal(territoryPeriodAt(1721, month).polityId, 'russian-empire');
  assert.equal(periodAt(1721, month)?.polityId, 'russian-empire');
  assert.equal(periodAt(1721, month)?.politicalPolityId ?? periodAt(1721, month)?.polityId,
    'russian-empire');
}
assert.equal(territoryPeriodAt(1721).polityId, 'russian-empire',
  'legacy year-only callers use the year-end state');
assert.equal(territoryPeriodAt(1720, 12).polityId, 'russian-tsardom');
assert.equal(territoryPeriodAt(1722, 1).polityId, 'russian-empire');

assert.equal(territoryPeriodAt(1922, 11).polityId, 'rsfsr');
assert.equal(territoryPeriodAt(1922, 12).polityId, 'ussr');
assert.equal(territoryPeriodAt(1922).polityId, 'ussr',
  'legacy year-only callers use the year-end state');
assert.equal(territoryPeriodAt(1917, 1).label, 'Россия в 1917 году',
  'January 1917 must not be called the Russian Republic');
assert.throws(() => territoryPeriodAt(1922, 0), RangeError);
assert.throws(() => territoryPeriodAt(1922, 13), RangeError);

console.log('Territory monthly polity chronology matches canonical History Core for 1720–1722 and 1917–1923, including Gregorian 1721 title transition.');
