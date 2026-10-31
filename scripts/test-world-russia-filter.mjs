import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isRussianWorldFeature,worldBackgroundTransitionPhase} from '../src/app/territory/worldRussiaFeatureFilter.mjs';
import {worldHistoricalContextCaveat,worldHistoricalContextCompactCaveat} from '../src/app/territory/worldHistoricalContextCaveat.mjs';

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
// State-name substring matches must not erase explicitly administrative
// world context. These names are not Russian sovereign-state polygons.
for (const name of [
  'Moscow Oblast', 'Moscow City', 'City of Moscow', 'Vladimir Region',
  'Vladimir Governorate', 'Russian District', 'Russia Province',
  'Московская область', 'Московский район', 'город Москва',
  'Владимирская область', 'Русский район', 'Российская губерния',
]) {
  assert.equal(isRussianWorldFeature({properties: {NAME: name}}, 1500), false,
    'local administrative unit is not the Russian state: ' + name);
  assert.equal(isRussianWorldFeature({properties: {NAME_RU: name}}, 2026), false,
    'local administrative unit must remain in modern world context: ' + name);
}
// If another original alias explicitly names the sovereign state, retain it.
assert.equal(isRussianWorldFeature({
  properties: {NAME: 'Moscow Oblast', NAME_RU: 'Российская империя'},
}, 1800), true);
assert.equal(isRussianWorldFeature({properties: {NAME: 'Grand Duchy of Moscow'}}, 1300), true);
assert.equal(isRussianWorldFeature({properties: {NAME_RU: 'Владимирское княжество'}}, 1200), true);
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
// The 3 May 1500 (Julian) oath preceded the end of May in either calendar.
// A year-only caller cannot resolve the transition and must stay cautious.
assert.equal(isRussianWorldFeature(seversky1500, 1500, 4), false);
assert.equal(isRussianWorldFeature(seversky1500, 1500, 5), true);
assert.equal(isRussianWorldFeature(seversky1500, 1500, 12), true);
assert.equal(isRussianWorldFeature(seversky1500, 1500, 0), false);
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
// The 1521 administrative change is documented by the end of September,
// but the exact legal annexation month is not. Preserve Jan–Aug as context.
assert.equal(isRussianWorldFeature(ryazan1500, 1521, 8), false);
assert.equal(isRussianWorldFeature(ryazan1500, 1521, 9), true);
assert.equal(isRussianWorldFeature(ryazan1500, 1521, 12), true);
assert.equal(isRussianWorldFeature(ryazan1500, 1521, 13), false);
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
assert.equal(isRussianWorldFeature({properties:{NAME:'Ryazan Oblast'}}, 1521, 9), false);
assert.equal(isRussianWorldFeature({properties:{NAME:'Novgorod-Seversky District'}}, 1500, 5), false);
for (const [year, month, phase] of [
  [1500,4,0],[1500,5,1],[1500,12,1],[1500,13,0],
  [1521,8,0],[1521,9,1],[1521,12,1],[1510,9,0],[2026,10,0],
]) assert.equal(worldBackgroundTransitionPhase(year, month), phase);

// Both production projections must apply the same month-level identity rule.
// The phase is a dependency so ordinary month scrubbing does not regenerate
// large globe textures when the background identity has not changed.
const flatSource = readFileSync(new URL('../src/app/territory/HistoricalTerritoryFlatMap.jsx', import.meta.url), 'utf8');
const globeSource = readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx', import.meta.url), 'utf8');
assert.match(flatSource, /isRussianWorldFeature\(feature,year,month\)/);
assert.match(flatSource, /\[world,year,backgroundPhase\]/);
assert.equal((globeSource.match(/isRussianWorldFeature\(f,year,month\)/g) ?? []).length, 3,
  'globe fill, border and country-label layers must share month-level filtering');
assert.match(globeSource, /buildStateTexture\(world,russiaFeatures,mobile\?2048:4096,year,month\)/);
assert.match(globeSource, /\[mode,projection,world,russiaKey,mobile,historyLoading,year,backgroundPhase\]/);
assert.match(globeSource, /if\(!r\|\|projection!=='globe'\|\|mode!=='states'\)return/,
  'globe state textures must not rebuild while the flat projection is visible');
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
// Before the May 1500 allegiance change, the source's separate polity is
// historically appropriate. A caveat must not anticipate a future event.
for (const month of [1, 2, 3, 4]) {
  assert.equal(contextAt(1500, month, 1500), null,
    'January–April 1500 must not claim the May transfer has already happened');
}
for (const [year, month] of [[1500,5],[1500,12],[1501,1],[1523,12]]) {
  assert.match(contextAt(year, month, 1500),
    /под власть Москвы в 1500 г.; зависимый удел сохранялся до 1523 г/);
}
// The appanage ended in 1523, but the selected 1500 background still
// contains the stale separate polity until the next snapshot in 1530.
// The warning must not silently disappear when the appanage disappears.
for (const [year, month] of [[1524,1],[1527,6],[1529,12]]) {
  assert.match(contextAt(year, month, 1500),
    /Мировой фон 1500 г. устарел: Новгород-Северский удел упразднён в 1523 г/);
  assert.equal(isRussianWorldFeature(seversky1500, year, month), true,
    'obsolete separate sovereign fill must remain hidden while the 1500 snapshot is reused');
}
// The 1500 background's Pskov and Ryazan polygons become stale at different
// documented cutoffs. Their removal must be disclosed, not mistaken for a
// verified replacement. The Ryazan date is a conservative control cutoff,
// NOT a claim about the exact month of legal annexation.
for (const [year, month] of [[1500,5],[1509,12]]) {
  assert.doesNotMatch(contextAt(year, month, 1500), /контуры Пскова|контуры Рязани/);
}
assert.match(contextAt(1510,1,1500), /контуры Пскова \(с января 1510 г\.\)/,
  'the Pskov omission must be disclosed from the January 1510 month end');
assert.doesNotMatch(contextAt(1510,1,1500), /Рязани/,
  'the 1500 Ryazan background is still separate in 1510');
assert.doesNotMatch(contextAt(1521,8,1500), /Рязани/,
  'do not anticipate the conservative September 1521 control cutoff');
for (const [year, month] of [[1521,9],[1521,12],[1522,1],[1524,1],[1529,12]]) {
  const note = contextAt(year, month, 1500);
  assert.match(note, /Пскова \(с января 1510 г\.\)/);
  assert.match(note, /Рязани \(контроль Москвы подтверждён к концу сентября 1521 г/);
  assert.match(note, /точная дата присоединения не установлена/);
  assert.match(note, /датированная замена не подтверждена/);
}
// Mobile summaries must disclose the same dated entities while leaving the
// full explanation accessible in an expandable, scrollable disclosure.
const compactAt = (year, month, snapshotYear = 1500) =>
  worldHistoricalContextCompactCaveat({year,month}, snapshotYear);
assert.equal(compactAt(1500,4), null);
assert.match(compactAt(1500,5), /Новгород-Северский/);
assert.doesNotMatch(compactAt(1509,12), /Псков|Рязань/);
assert.match(compactAt(1510,1), /Псков/);
assert.doesNotMatch(compactAt(1521,8), /Рязань/);
assert.match(compactAt(1521,9), /Рязань/);
assert.match(compactAt(1529,12), /Новгород-Северский, Псков, Рязань/);
assert.equal(compactAt(1530,1,1530), null);
assert.match(compactAt(1485,8,1400), /Тверь и Псков/);
assert.match(compactAt(1485,9,1400), /Псков/);
assert.doesNotMatch(compactAt(1485,9,1400), /Тверь/);
const globeUi = readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx', import.meta.url), 'utf8');
const globeCss = readFileSync(new URL('../src/app/territory/territory-webgl.module.css', import.meta.url), 'utf8');
assert.match(globeUi, /<details className=\{styles\.worldContextCompact\}>/);
assert.match(globeUi, /<summary>\{compactWorldContextCaveat\}<\/summary>/);
assert.match(globeUi, /<div>\{worldContextCaveat\}<\/div><\/details>/);
assert.match(globeCss, /\.worldContextCompact\{display:none;pointer-events:auto\}/,
  'the clickable disclosure must override pointer-events:none on the story overlay');
assert.match(globeCss, /@media\(max-width:760px\)\{/);
assert.match(globeCss, /\.worldContextCompact\[open\]\{max-height:/);
assert.equal(contextAt(1530,1,1530), null,
  'new 1530 snapshot must not inherit the stale 1500 warning');
assert.equal(contextAt(1530, 1, 1530), null);
assert.equal(contextAt(1492, 1, 1492), null);
assert.equal(contextAt(1492, 1), null, 'a 1400 snapshot should not be claimed to cover 1492');
assert.equal(contextAt(1400, 1, 1500), null);
assert.equal(contextAt(1400, 0), null);
assert.equal(worldHistoricalContextCaveat(null, 1400), null);

console.log('Historical world Russian-state polygons are excluded across English/Russian aliases; unrelated Soviet republics and PARTOF remain visible.');
