import assert from 'node:assert/strict';
import {historicalGeometryCaveat} from '../src/app/territory/historicalGeometryCaveats.mjs';
import {renderedWorldSnapshotYear} from '../src/app/territory/worldSnapshotCaptionYear.mjs';
import {readFileSync} from 'node:fs';

const old = {
  status: 'geometry-verified',
  geometryFile: 'data/history-core/generated/territory/base-grand-moscow-end-1505-1505-12-01.geojson',
};
const at = (year, month = 7, state = old) => historicalGeometryCaveat({year, month}, state);
const older = {
  status: 'geometry-verified',
  geometryFile: 'data/history-core/generated/territory/base-grand-moscow-end-1462-1462-12-01.geojson',
};
const at1462 = (year, month = 7, state = older) => historicalGeometryCaveat({year, month}, state);

assert.equal(at1462(1462, 12), null, 'the dated 1462 snapshot is not a reused state');
assert.match(at1462(1463, 1).desktop, /1463-01/);
assert.doesNotMatch(at1462(1477, 12).desktop, /Новгород/);
assert.match(at1462(1478, 1).desktop, /присоединение Новгорода \(1478\)/,
  'January 1478 surrender is documented; the unchanged 1462 contour must warn by month end');
assert.match(at1462(1478, 1).mobile, /Новгород \(1478\)/);
assert.match(at1462(1478, 12).desktop, /присоединение Новгорода \(1478\)/);
assert.match(at1462(1479, 1).desktop, /присоединение Новгорода \(1478\)/);
assert.match(at1462(1479, 1).mobile, /Новгород \(1478\)/);

assert.doesNotMatch(at1462(1474, 12).desktop, /ростовских земель/,
  'a year-only 1474 acquisition must not be assigned an unsupported month');
assert.match(at1462(1475, 1).desktop, /приобретение ростовских земель \(1474\)/,
  'the unchanged 1462 geometry must warn after the documented 1474 Rostov purchase');
assert.doesNotMatch(at1462(1485, 8).desktop, /Твери/,
  'Tver was still independent before its September 1485 surrender');
assert.match(at1462(1485, 9).desktop, /присоединение Твери \(1485\)/,
  'September 1485 Tver surrender makes the 1462 contour stale');
assert.match(at1462(1485, 9).mobile, /Тверь \(1485\)/);
assert.doesNotMatch(at1462(1489, 12).desktop, /Вятки/,
  'year-only Vyatka evidence must not be assigned an invented effective month');
assert.match(at1462(1490, 1).desktop, /подчинение Вятки \(1489\)/,
  'the 1462 contour must warn after the documented 1489 Vyatka subordination');
assert.match(at1462(1490, 1).mobile, /Ростов \(1474\).*Новгород \(1478\).*Тверь \(1485\).*Вятка \(1489\)/,
  'mobile accuracy caption must list all four known transitions in chronological order');

assert.match(at1462(1504, 12).mobile, /точность не подтверждена/);
assert.equal(at1462(1505, 1), null, 'do not infer an uninspected 1505 month');
assert.equal(at1462(1480, 1, {...older, geometryFile:'data/history-core/generated/territory/corrected-1480.geojson'}), null,
  'a newly dated polygon must clear the 1462 reuse warning');
assert.equal(at1462(1480, 1, {...older, status:'reconstruction-provisional'}), null,
  'provisional geometry is not a geometry-verified reused snapshot');


assert.equal(at(1505), null, '1505 is the source snapshot, not a reused later state');
assert.match(at(1506).desktop, /1506-07/);
assert.doesNotMatch(at(1509).desktop, /Псков|Смоленск/);
assert.match(at(1510, 1).desktop, /Псков \(1510\)/,
  'Pskov veche ended in January 1510; warn at end of that month');
assert.match(at(1510, 1).mobile, /Псков \(1510\)/);
assert.match(at(1511).desktop, /Псков \(1510\)/);
assert.doesNotMatch(at(1513).desktop, /Смоленск/);
assert.doesNotMatch(at(1514, 7).desktop, /Смоленск/,
  'Julian 30–31 July surrender corresponds to August Gregorian');
assert.match(at(1514, 8).desktop, /Смоленск \(1514\)/,
  'warn at August 1514 month end after the documented surrender');
assert.match(at(1514, 8).mobile, /Смоленск \(1514\)/);
assert.match(at(1515).desktop, /Смоленск \(1514\)/);
assert.doesNotMatch(at(1520).desktop, /Рязань/,
  'Ryazan must not be listed before the documented 1521 annexation');
assert.doesNotMatch(at(1521, 1).desktop, /Рязань/,
  'January 1521 must not be assigned an unsupported annexation date');
assert.doesNotMatch(at(1521, 8).desktop, /Рязань/,
  'August is not an asserted exact legal annexation month; the warning cutoff is conservative');
assert.match(at(1521, 9).desktop, /Рязань \(1521\)/,
  'by September month-end Moscow control is documented, though the exact legal month is unknown');
assert.match(at(1521, 9).mobile, /Рязань \(1521\)/,
  'the September warning must also be visible on narrow screens');
assert.match(at(1521, 12).desktop, /Рязань \(1521\)/,
  'year-end 1521 must continue to disclose the missing Ryazan boundary');
assert.match(at(1521, 12).mobile, /Рязань \(1521\)/,
  'year-end 1521 must disclose Ryazan on narrow screens');
assert.match(at(1522, 1).desktop, /Рязань \(1521\)/,
  'the 1505 polygon cannot represent Ryazan annexation in 1522');
assert.match(at(1522, 1).mobile, /Рязань \(1521\)/,
  'the unresolved Ryazan transition must remain visible on phones');
assert.match(at(1532, 12).mobile, /Псков \(1510\).*Смоленск \(1514\).*Рязань \(1521\)/,
  'all three missing transitions must remain visible at the end of the reused contour');
assert.match(at(1532, 12).mobile, /точность не подтверждена/);
assert.equal(at(1533, 1), null, 'do not infer uninspected months');
assert.equal(at(1514, 7, {...old, geometryFile: 'data/history-core/generated/territory/corrected-1514.geojson'}), null,
  'a dated replacement must automatically remove the warning');
assert.equal(at(1514, 7, {...old, status: 'reconstruction-provisional'}), null,
  'provisional geometry already has a different accuracy label');
assert.equal(historicalGeometryCaveat({year: 1514, month: 0}, old), null);
assert.equal(historicalGeometryCaveat(null, old), null);

 
// A 1500 world fetch can begin while React still displays the 1400 snapshot.
// The accuracy caption must attribute the currently rendered world layer,
// not the in-flight request, and must not invent a year during loading.
assert.equal(renderedWorldSnapshotYear('Исторический мировой срез 1400 года · History Core 1478-01'), 1400);
assert.equal(renderedWorldSnapshotYear('Исторический мировой срез 1500 года · History Core 1514-08'), 1500);
assert.equal(renderedWorldSnapshotYear('Исторический мировой срез 2020 года · History Core 2026-10'), 2020);
for (const pending of [
  'Исторический мировой срез — года · History Core 1514-08',
  'Мировой контекст: приблизительный срез 1500 года',
  'Исторический мировой срез 1500 года без даты',
  '',
  null,
]) assert.equal(renderedWorldSnapshotYear(pending), null,
  'uncommitted or malformed world years must not be used in accuracy captions');
const accuracyPatch = readFileSync(new URL('../src/app/territory/mapHistoricalAccuracyPatch.js', import.meta.url), 'utf8');
assert.match(accuracyPatch, /const displayedWorldYear = renderedWorldSnapshotYear\(text\)/);
assert.match(accuracyPatch, /Мировой фон: приблизительно \$\{displayedWorldYear\}/);
assert.doesNotMatch(accuracyPatch, /selected\.year !== state\.worldSnapshotYear/,
  'mobile accuracy caption must not rely on the last requested fetch');

console.log('Historical geometry caveat and committed world-snapshot caption regressions passed');
