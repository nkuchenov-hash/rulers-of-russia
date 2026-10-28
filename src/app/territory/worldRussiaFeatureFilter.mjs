// The world archive is only background context. Its Russian/Soviet polygons
// must not be drawn over the month-resolved History Core state. Historical
// Basemaps and Natural Earth can supply different name fields and languages.
// Inspect aliases independently: a Russian NAME_RU must not hide an English
// NAME, and vice versa. PARTOF is deliberately excluded: a non-Russian polity
// can have Russian suzerainty without being the Russian state polygon.
const NAME_FIELDS = ['NAME_RU', 'name_ru', 'RU_NAME', 'NAME', 'name', 'ADMIN', 'entity', 'polity', 'ABBREVN', 'SUBJECTO'];
// "Soviet" alone does not identify the USSR: the Hungarian, Bavarian and
// Slovak Soviet republics were distinct polities. Do not erase their world
// context simply because their form of government included the same word.
// Nor is every place named Novgorod the Russian state: the Novgorod Republic
// remained separate from Moscow until its 1478 annexation, and the 1500
// Historical Basemaps snapshot contains a distinct Novgorod-Seversky polity.
const ENGLISH = /\b(?:russia|russian|ussr|rsfsr|union of soviet socialist republics|soviet union|soviet russia|kievan rus|kyivan rus|rus|muscovy|moscow|vladimir)\b/i;
const CYRILLIC = /(?:^|[^а-яё])(?:россия|российск[а-яё]*|русск[а-яё]*|русь|ссср|рсфср|советский союз|советская россия|союз советских социалистических республик|московия|московск[а-яё]*|владимирск[а-яё]*)(?=$|[^а-яё])/i;
const NOVGOROD_ENGLISH = /^(?:the )?(?:(?:principality|republic|land) of )?novgorod(?: (?:republic|principality|land))?$/i;
const NOVGOROD_CYRILLIC = /^новгород(?:ская|ское|ский|ской)?(?: (?:земля|республика|княжество))?$/i;
// The 1500 snapshot also names Novgorod-Seversky. This is a different
// polity from Novgorod Republic, but the same 1500 snapshot is reused through
// 1529. The 1503 Lithuanian–Muscovite peace formally recognized its transfer;
// suppress that stale separate background polygon from 1503 onward.
// This is a year-level visual guard, not a month-accurate sovereignty claim.
const SEVERSKY_ENGLISH = /^(?:(?:principality|duchy) of )?novgorod[- ](?:seversky|seversk|siversky|siversk)(?: principality)?$/i;
const SEVERSKY_CYRILLIC = /^новгород[- ]северск[а-яё]*(?: княжество)?$/i;

// The pinned 1492 and 1500 world snapshots contain Pskov and Ryazan as
// separately named polities. The 1500 snapshot is reused until 1529, even
// after their annexations by Moscow (Pskov 1510; Ryazan 1521). Retain them
// as independent background context BEFORE those years, and suppress stale
// independent fills afterwards. This is a year-level BACKGROUND guard, not
// evidence for the exact month of either boundary transition.
// Sources: https://pskov.ru/region/istoriya/prisoedinenie-k-moskve
// https://bigenc.ru/c/rossiia-istoriia-russkoe-gosudarstvo-obrazovanie-stanovlenie-formirovanie-territorii-i-ebc93b
// https://nationalatlas.ru/tom1/20-22.html
const PSKOV_ENGLISH = /^(?:(?:republic|principality|land) of )?pskov(?: (?:republic|principality|land))?$/i;
const PSKOV_CYRILLIC = /^(?:псков|псковск[а-яё]*)(?: (?:республика|земля|княжество))?$/i;
const RYAZAN_ENGLISH = /^(?:(?:grand )?(?:duchy|principality|land) of )?ryazan(?: (?:grand duchy|principality|land))?$/i;
const RYAZAN_CYRILLIC = /^(?:рязань|рязанск[а-яё]*)(?: (?:княжество|земля))?$/i;

// Use the selected historical year, not the older world-snapshot year.
// This controls BACKGROUND rendering only; it never certifies or changes
// History Core sovereign geometry. If the year is unavailable, fail safe
// against a duplicate Russian-state fill rather than guessing independence.
export function isRussianWorldFeature(feature, selectedYear = null) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== 'object') return false;
  return NAME_FIELDS.some(key => {
    const name = properties[key];
    if (typeof name !== 'string') return false;
    if (ENGLISH.test(name) || CYRILLIC.test(name)) return true;
    if (PSKOV_ENGLISH.test(name.trim()) || PSKOV_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && selectedYear >= 1510;
    }
    if (RYAZAN_ENGLISH.test(name.trim()) || RYAZAN_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && selectedYear >= 1521;
    }
    if (SEVERSKY_ENGLISH.test(name.trim()) || SEVERSKY_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && selectedYear >= 1503;
    }
    if (NOVGOROD_ENGLISH.test(name.trim()) || NOVGOROD_CYRILLIC.test(name.trim())) {
      // 1136–1477: the Novgorod Republic is separate world context.
      // 1478+: do not paint a stale Novgorod world polygon over Moscow.
      return !(Number.isInteger(selectedYear) && selectedYear >= 1136 && selectedYear < 1478);
    }
    return false;
  });
}
