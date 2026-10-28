import assert from 'node:assert/strict';
import {historicalGeometryCaveat} from '../src/app/territory/historicalGeometryCaveats.mjs';

const old = {
  status: 'geometry-verified',
  geometryFile: 'data/history-core/generated/territory/base-grand-moscow-end-1505-1505-12-01.geojson',
};
const at = (year, month = 7, state = old) => historicalGeometryCaveat({year, month}, state);

assert.equal(at(1505), null, '1505 is the source snapshot, not a reused later state');
assert.match(at(1506).desktop, /1506-07/);
assert.doesNotMatch(at(1509).desktop, /Псков|Смоленск/);
assert.doesNotMatch(at(1510).desktop, /Псков/, 'do not assume an effective month inside 1510');
assert.match(at(1511).desktop, /Псков \(1510\)/);
assert.doesNotMatch(at(1513).desktop, /Смоленск/);
assert.doesNotMatch(at(1514).desktop, /Смоленск/, 'do not assume an effective month inside 1514');
assert.match(at(1515).desktop, /Смоленск \(1514\)/);
assert.doesNotMatch(at(1520).desktop, /Рязань/,
  'Ryazan must not be listed before the documented 1521 annexation');
assert.doesNotMatch(at(1521).desktop, /Рязань/,
  'do not invent an effective month within the 1521 annexation year');
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
console.log('Historical geometry caveat regression passed');
