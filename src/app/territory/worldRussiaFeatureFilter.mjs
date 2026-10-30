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
// The 1500 snapshot also names Novgorod-Seversky, a distinct appanage
// principality (NOT Novgorod Republic). Its prince swore allegiance to Moscow
// on 3 May 1500; the 1503 truce only confirmed that earlier transfer.
// The principality survived as a dependent appanage until 1523. Suppress its
// obsolete *separate sovereign* background fill from the first unambiguous
// full year (1501), but keep the within-year transition 1500 visible.
// This does not erase the appanage from history or certify History Core borders.
// Source: https://bigenc.ru/c/novgorod-severskoe-kniazhestvo-e28685
const SEVERSKY_ENGLISH = /^(?:(?:principality|duchy) of )?novgorod[- ](?:seversky|seversk|siversky|siversk)(?: principality)?$/i;
const SEVERSKY_CYRILLIC = /^новгород[- ]северск[а-яё]*(?: княжество)?$/i;

// The pinned 1500 Historical Basemaps world snapshot explicitly names
// Pskov and Ryazan as separate polities and is reused until the 1530
// snapshot. Pskov was annexed in January 1510, Ryazan in 1521. Do not
// paint those *stale background* polygons as independent after annexation.
// For Ryazan, preserve the entire transition year (1521) as uncertain:
// a year-only filter cannot establish which month the source depicts.
// These exact names must not hide modern oblasts or unrelated place labels.
// Source names: https://jesusiniesta.es/es-ES/maps/historic-borders/1500
// Dates: https://the-epoch-institute.org/state/pskov-republic
//        https://www.rzn.info/articles/pochemu-ryazan-prisoedinili-k-moskve-500-let-nazad.html
const PSKOV_ENGLISH = /^(?:the )?(?:(?:republic|principality|land) of )?pskov(?: (?:republic|principality|land))?$/i;
const PSKOV_CYRILLIC = /^псков(?:ская|ское|ский|ской)?(?: (?:земля|республика|княжество))?$/i;
const RYAZAN_ENGLISH = /^(?:the )?(?:(?:grand )?(?:principality|duchy|land) of )?ryazan(?: (?:grand )?(?:principality|duchy|land))?$/i;
const RYAZAN_CYRILLIC = /^рязан(?:ь|ская|ское|ский|ской)?(?: (?:земля|княжество))?$/i;

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
      // 1521 is a within-year transfer: retain the old world context until
      // 1522 instead of pretending that January 1521 was post-annexation.
      return Number.isInteger(selectedYear) && selectedYear >= 1522;
    }
    if (SEVERSKY_ENGLISH.test(name.trim()) || SEVERSKY_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && selectedYear >= 1501;
    }
    if (NOVGOROD_ENGLISH.test(name.trim()) || NOVGOROD_CYRILLIC.test(name.trim())) {
      // 1136–1477: the Novgorod Republic is separate world context.
      // 1478+: do not paint a stale Novgorod world polygon over Moscow.
      return !(Number.isInteger(selectedYear) && selectedYear >= 1136 && selectedYear < 1478);
    }
    return false;
  });
}
