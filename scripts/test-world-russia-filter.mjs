import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRussianWorldFeature} from '../src/app/territory/worldRussiaFeatureFilter.mjs';
import {worldHistoricalContextCaveat} from '../src/app/territory/worldHistoricalContextCaveat.mjs';

const russianNames = [
  {NAME: 'Russian Empire'}, {NAME: 'Soviet Union'}, {NAME: 'USSR'},
  // Actual Historical Basemaps naming conventions include these forms.
  {NAME: "Rus' Khaganate"}, {NAME: 'Kyivan Rus'},
  {NAME: 'Muscovy'}, {NAME: 'Kievan Rus'}, {NAME: 'Russian Federation'},
  {NAME: 'Soviet Russia'}, {NAME: 'Union of Soviet Socialist Republics'},
  {NAME_RU: 'Российская империя'}, {name_ru: 'Русское царство'},
  {RU_NAME: 'СССР'}, {ADMIN: 'РСФСР'}, {entity: 'Советский Союз'},
  {entity: 'Союз Советских Социалистических Республик'},
  {NAME_RU: 'Советская Россия'},
  {polity: 'Московское государство'}, {NAME_RU: 'Киевская Русь'},
  {NAME_RU: 'Новгородская земля'}, {NAME_RU: 'Владимирское княжество'},
  // A translated display name may disagree with the source NAME field.
  {NAME_RU: 'Россия', NAME: 'Russia'}, {NAME_RU: 'Неизвестно', NAME: 'Soviet Union'},
];
for (const properties of russianNames) {
  assert.equal(isRussianWorldFeature({properties}), true, JSON.stringify(properties));
}
const otherNames = [
  {NAME: 'Belarus'}, {NAME: 'Prussia'}, {NAME: 'Prussians'}, {NAME: 'Austria'},
  {NAME: 'Finland', PARTOF: 'Russian Empire'},
  {NAME_RU: 'Белоруссия', NAME: 'Belarus'},
  {NAME: 'Mongolia'}, {NAME: 'Kingdom of Poland'},
  {NAME: 'Sovietsky district'},
  // Soviet denotes a political form, not necessarily USSR sovereignty.
  // Hungary (March–August 1919) and Bavaria (April–May 1919) were not
  // territorial components of Russia or the later Soviet Union.
  {NAME: 'Hungarian Soviet Republic'},
  {NAME: 'Soviet Republic of Hungary'},
  {NAME: 'Bavarian Soviet Republic'},
  {NAME: 'Slovak Soviet Republic'},
  {NAME_RU: 'Венгерская Советская Республика'},
  {NAME_RU: 'Баварская Советская Республика'},
  {NAME_RU: 'Венгерская Советская Республика', NAME: 'Hungarian Soviet Republic'},
];
for (const properties of otherNames) {
  assert.equal(isRussianWorldFeature({properties}), false, JSON.stringify(properties));
}
assert.equal(isRussianWorldFeature({properties: {NAME: 'Finland', PARTOF: 'Russian Empire'}}), false);
assert.equal(isRussianWorldFeature({properties: {NAME: 'Belarus'}}), false);
assert.equal(isRussianWorldFeature(null), false);
assert.equal(isRussianWorldFeature({properties: {NAME: 123}}), false);


// Ground this regression in the pinned Historical Basemaps snapshots shipped
// with the site. In 1400 the world archive labels Novgorod separately from
// Moscow; in 1500 it contains Novgorod-Seversky, NOT the Novgorod Republic.
// A broad /novgorod/ match used to erase both from the globe and flat map.
const archivedFeature = (snapshot, name) => {
  const archive = JSON.parse(readFileSync(new URL(
    `../public/data/territory/world-history/snapshots/${snapshot}.geojson`, import.meta.url,
  ), 'utf8'));
  const feature = archive.features.find(f => f.properties?.NAME === name);
  assert.ok(feature, `Pinned world snapshot ${snapshot} must contain ${name}`);
  return feature;
};
const novgorod1400 = archivedFeature(1400, 'Novgorod');
assert.equal(isRussianWorldFeature(novgorod1400, 1400), false,
  'Novgorod Republic must remain visible alongside Moscow in the 1400 world context');
assert.equal(isRussianWorldFeature(novgorod1400, 1462), false,
  'a 1400 background snapshot reused in 1462 must not erase independent Novgorod');
assert.equal(isRussianWorldFeature(novgorod1400, 1477), false,
  'Novgorod remained a distinct polity before the 1478 annexation');
assert.equal(isRussianWorldFeature(novgorod1400, 1478), true,
  'after annexation an obsolete background Novgorod polygon must not overlay History Core');
const seversky1500 = archivedFeature(1500, 'Novgorod-Seversky');
assert.equal(isRussianWorldFeature(seversky1500, 1500), false,
  'Novgorod-Seversky is distinct from Novgorod Republic; the May 1500 allegiance is within-year');
assert.equal(isRussianWorldFeature(seversky1500, 1501), true,
  'the 1500 archive must not show the Moscow-dependent appanage as a separate sovereign in 1501');
assert.equal(isRussianWorldFeature(seversky1500, 1502), true,
  'the 1503 peace confirmed a transfer already effective in 1500');
assert.equal(isRussianWorldFeature(seversky1500, 1503), true,
  'the appanage persisted, but was no longer a separate sovereign state');
assert.equal(isRussianWorldFeature(seversky1500, 1520), true,
  'the stale 1500 snapshot must not redraw Novgorod-Seversky as independent in 1520');
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Новгород-Северское княжество'}}, 1520), true,
  'Russian spelling of Novgorod-Seversky must follow the same 1503 guard');
// The actual pinned 1500 background still contains these independent
// entities. Its geometry is reused for later years; only the background
// identities are suppressed after annexation, not the History Core polygons.
const pskov1500 = archivedFeature(1500, 'Pskov');
assert.equal(isRussianWorldFeature(pskov1500, 1500), false);
assert.equal(isRussianWorldFeature(pskov1500, 1509), false,
  'Pskov must remain a separate polity before January 1510');
assert.equal(isRussianWorldFeature(pskov1500, 1510), true,
  'the stale 1500 Pskov polygon must not be shown as independent after annexation');
assert.equal(isRussianWorldFeature(pskov1500, 1529), true);
const ryazan1500 = archivedFeature(1500, 'Ryazan');
assert.equal(isRussianWorldFeature(ryazan1500, 1520), false);
assert.equal(isRussianWorldFeature(ryazan1500, 1521), false,
  'a year-only background cannot assume that all of 1521 followed the annexation');
assert.equal(isRussianWorldFeature(ryazan1500, 1522), true,
  'the stale 1500 Ryazan polygon must not be shown as independent in 1522–1529');
assert.equal(isRussianWorldFeature(ryazan1500, 1529), true);
for (const name of ['Pskov Oblast', 'Ryazan Oblast', 'Pskov City', 'Ryazan District']) {
  assert.equal(isRussianWorldFeature({properties:{NAME:name}}, 1550), false,
    'a region or city must not be mistaken for an independent state: ' + name);
}
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Псковская республика'}}, 1510), true);
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Рязанское княжество'}}, 1522), true);
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Рязанская область'}}, 1522), false);
assert.equal(isRussianWorldFeature(archivedFeature(1300, 'Grand Duchy of Moscow'), 1300), true,
  'the current Moscow state must still be suppressed in the background');
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Новгородская республика'}}, 1462), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Novgorod Republic'}}, 1462), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Novgorod-Seversky'}}, 1500), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Russian Empire', NAME_RU:'Новгородская республика'}}, 1462), true,
  'a separately named Novgorod alias must not override explicit Russian-state identity');

// Source-completeness regression: the pinned 1400 world archive omits
// separately named Tver AND Pskov, although both remained distinct political
// entities in 1400. The same world snapshot is reused until 1492. The Tver
// warning expires after its September 1485 surrender, but the Pskov warning
// must remain until the next snapshot. Never invent missing source polygons.
const snapshot1400 = JSON.parse(readFileSync(new URL(
  '../public/data/territory/world-history/snapshots/1400.geojson', import.meta.url,
), 'utf8'));
for (const missing of [/tver|твер/i, /pskov|псков/i]) {
  assert.equal(snapshot1400.features.some(f => Object.values(f.properties ?? {})
    .some(v => typeof v === 'string' && missing.test(v))), false,
  'the caveat must be revised if a pinned source feature is added: ' + missing);
}
const worldIndex = JSON.parse(readFileSync(new URL(
  '../public/data/territory/world-history/index.json', import.meta.url,
), 'utf8'));
assert.equal(worldIndex.snapshots.filter(s => s.year > 1400 && s.year < 1492).length, 0,
  'the caveat assumes that the 1400 world background is reused until 1492');
const contextAt = (year, month, snapshotYear = 1400) =>
  worldHistoricalContextCaveat({year, month}, snapshotYear);
for (const [year, month] of [[1400,1],[1484,12],[1485,8]]) {
  assert.match(contextAt(year, month), /Тверское княжество и Псковская земля не выделены/);
}
for (const [year, month] of [[1485,9],[1486,1],[1491,12]]) {
  assert.match(contextAt(year, month), /Псковская земля не выделена/);
  assert.doesNotMatch(contextAt(year, month), /Тверское княжество/,
    'Tver was incorporated in September 1485, but Pskov remains missing');
}
// The 1500 source is reused through 1529, but the 1500 change of
// allegiance and the 1523 abolition of the dependent appanage are different
// events. Both need disclosure, without inventing a replacement polygon.
assert.deepEqual(worldIndex.snapshots.filter(s => s.year >= 1500 && s.year <= 1530)
  .map(s => s.year), [1500, 1530]);
for (const [year, month] of [[1500,1],[1500,12],[1501,1],[1523,12]]) {
  assert.match(contextAt(year, month, 1500),
    /под власть Москвы в 1500 г.; зависимый удел сохранялся до 1523 г/);
}
assert.equal(contextAt(1524, 1, 1500), null,
  'the dependent Novgorod-Seversky appanage no longer existed after 1523');
assert.equal(contextAt(1530, 1, 1530), null);
assert.equal(contextAt(1492, 1, 1492), null);
assert.equal(contextAt(1492, 1), null, 'a 1400 snapshot should not be claimed to cover 1492');
assert.equal(contextAt(1400, 1, 1500), null);
assert.equal(contextAt(1400, 0), null);
assert.equal(worldHistoricalContextCaveat(null, 1400), null);

console.log('Historical world Russian-state polygons are excluded across English/Russian aliases; unrelated Soviet republics and PARTOF remain visible.');
