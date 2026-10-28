import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {POLITY_TRANSITION_YEARS, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR, territoryPeriodAt} from '../src/app/territory/territoryChronology.ts';

// Compare the UI's period selection against the independent canonical
// History Core coverage model, not against hard-coded expected UI labels.
const coverage = JSON.parse(readFileSync(new URL(
  '../public/data/history-core/coverage-periods.json', import.meta.url,
), 'utf8'));
const periodAt = (year, month) => coverage.periods.find(period => {
  const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  return key >= period.startMonth && key <= period.endMonth;
});

// Fail closed on unsupported dates rather than silently returning the 862 state.
for (const year of [TERRITORY_MIN_YEAR - 1, TERRITORY_MAX_YEAR + 1, NaN, 1721.5]) {
  assert.throws(() => territoryPeriodAt(year, 1), RangeError,
    `Unsupported year ${year} must not resolve to a different historical state`);
}
assert.equal(new Set(POLITY_TRANSITION_YEARS).size, POLITY_TRANSITION_YEARS.length,
  'Monthly transitions within one year must not duplicate year markers');
assert.equal(POLITY_TRANSITION_YEARS.filter(year => year === 1721).length, 1);
assert.equal(POLITY_TRANSITION_YEARS.filter(year => year === 1922).length, 1);

// Compare EVERY month in the public range with the canonical political track.
// This also catches accidental gaps in the UI chronology, rather than silently
// rendering the earliest period when no period covers a valid selected date.
let verifiedMonths = 0;
for (let year = TERRITORY_MIN_YEAR; year <= TERRITORY_MAX_YEAR; year++) {
  for (let month = 1; month <= 12; month++) {
    const expected = periodAt(year, month);
    assert.ok(expected, `canonical coverage missing ${year}-${month}`);
    assert.equal(territoryPeriodAt(year, month).polityId,
      expected.politicalPolityId ?? expected.polityId,
      `territory UI political title disagrees with History Core for ${year}-${month}`);
    verifiedMonths++;
  }
}
assert.equal(verifiedMonths, 13980, 'UI chronology must cover the entire 862–2026 monthly range');

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

console.log('Territory chronology covers all 13980 months without gaps, rejects unsupported dates, deduplicates transition years, and preserves 1721/1922 title transitions.');
