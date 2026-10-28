import assert from 'node:assert/strict';
import {isRussianWorldFeature} from '../src/app/territory/worldRussiaFeatureFilter.mjs';

const russianNames = [
  {NAME: 'Russian Empire'}, {NAME: 'Soviet Union'}, {NAME: 'USSR'},
  {NAME: 'Muscovy'}, {NAME: 'Kievan Rus'}, {NAME: 'Russian Federation'},
  {NAME_RU: 'Российская империя'}, {name_ru: 'Русское царство'},
  {RU_NAME: 'СССР'}, {ADMIN: 'РСФСР'}, {entity: 'Советский Союз'},
  {polity: 'Московское государство'}, {NAME_RU: 'Киевская Русь'},
  {NAME_RU: 'Новгородская земля'}, {NAME_RU: 'Владимирское княжество'},
  // A translated display name may disagree with the source NAME field.
  {NAME_RU: 'Россия', NAME: 'Russia'}, {NAME_RU: 'Неизвестно', NAME: 'Soviet Union'},
];
for (const properties of russianNames) {
  assert.equal(isRussianWorldFeature({properties}), true, JSON.stringify(properties));
}
const otherNames = [
  {NAME: 'Belarus'}, {NAME: 'Prussia'}, {NAME: 'Austria'},
  {NAME: 'Finland', PARTOF: 'Russian Empire'},
  {NAME_RU: 'Белоруссия', NAME: 'Belarus'},
  {NAME: 'Mongolia'}, {NAME: 'Kingdom of Poland'},
  {NAME: 'Sovietsky district'},
];
for (const properties of otherNames) {
  assert.equal(isRussianWorldFeature({properties}), false, JSON.stringify(properties));
}
assert.equal(isRussianWorldFeature({properties: {NAME: 'Finland', PARTOF: 'Russian Empire'}}), false);
assert.equal(isRussianWorldFeature({properties: {NAME: 'Belarus'}}), false);
assert.equal(isRussianWorldFeature(null), false);
assert.equal(isRussianWorldFeature({properties: {NAME: 123}}), false);
console.log('Historical world Russian-state polygons are excluded across English/Russian aliases; unrelated countries and PARTOF remain visible.');
