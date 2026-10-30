import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRussianWorldFeature} from '../src/app/territory/worldRussiaFeatureFilter.mjs';

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
// Tver was annexed in September 1485 (Great Russian Encyclopedia).
// The 1400 background snapshot is reused later in the 15th century.
// Do not infer a month from the year-only world layer: 1485 remains
// ambiguous, while the obsolete independent Tver overlay is hidden in 1486.
const tver1400 = archivedFeature(1400, 'Tver');
assert.equal(isRussianWorldFeature(tver1400, 1484), false,
  'Tver remains independent before its 1485 incorporation');
assert.equal(isRussianWorldFeature(tver1400, 1485), false,
  'year-only context must not erase the pre-annexation part of 1485');
assert.equal(isRussianWorldFeature(tver1400, 1486), true,
  'the obsolete independent Tver polygon must be hidden after 1485');
assert.equal(isRussianWorldFeature(tver1400, 1499), true);
for (const name of ['Grand Principality of Tver', 'Principality of Tver', 'Tver Grand Duchy']) {
  assert.equal(isRussianWorldFeature({properties:{NAME:name}}, 1486), true, name);
}
for (const name of ['Тверь', 'Тверское княжество', 'Великое княжество Тверское']) {
  assert.equal(isRussianWorldFeature({properties:{NAME_RU:name}}, 1486), true, name);
}
for (const name of ['Tver Oblast', 'Tver City', 'Tver Governorate', 'Tver District', 'Тверская область']) {
  assert.equal(isRussianWorldFeature({properties:{NAME:name}}, 1490), false,
    'a city or administrative region must not be treated as the old polity: ' + name);
}
assert.equal(isRussianWorldFeature({properties:{NAME:'Tver'}}, null), false,
  'unknown year must not assert that Tver was already annexed');

const seversky1500 = archivedFeature(1500, 'Novgorod-Seversky');
assert.equal(isRussianWorldFeature(seversky1500, 1500), false,
  'Novgorod-Seversky is a distinct polity, not an alias for Novgorod Republic');
assert.equal(isRussianWorldFeature(seversky1500, 1502), false,
  'the 1500 year-level world feature remains context before the 1503 peace');
assert.equal(isRussianWorldFeature(seversky1500, 1503), true,
  'after the 1503 peace the reused 1500 world polygon must not depict a separate state');
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

console.log('Historical world Russian-state polygons are excluded across English/Russian aliases; unrelated Soviet republics and PARTOF remain visible.');
