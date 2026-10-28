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
assert.equal(isRussianWorldFeature(archivedFeature(1300, 'Grand Duchy of Moscow'), 1300), true,
  'the current Moscow state must still be suppressed in the background');
assert.equal(isRussianWorldFeature({properties:{NAME_RU:'Новгородская республика'}}, 1462), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Novgorod Republic'}}, 1462), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Novgorod-Seversky'}}, 1500), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Russian Empire', NAME_RU:'Новгородская республика'}}, 1462), true,
  'a separately named Novgorod alias must not override explicit Russian-state identity');

console.log('Historical world Russian-state polygons are excluded across English/Russian aliases; unrelated Soviet republics and PARTOF remain visible.');
