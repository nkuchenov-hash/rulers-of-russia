// The world archive is only background context. Its Russian/Soviet polygons
// must not be drawn over the month-resolved History Core state. Historical
// Basemaps and Natural Earth can supply different name fields and languages.
// Inspect aliases independently: a Russian NAME_RU must not hide an English
// NAME, and vice versa. PARTOF is deliberately excluded: a non-Russian polity
// can have Russian suzerainty without being the Russian state polygon.
const NAME_FIELDS = ['NAME_RU', 'name_ru', 'RU_NAME', 'NAME', 'name', 'ADMIN', 'entity', 'polity', 'ABBREVN', 'SUBJECTO'];
// An alias containing "Moscow", "Vladimir" or "Russian" is not sufficient
// evidence of sovereign-state identity when the same name explicitly denotes
// an oblast, governorate, city or district. Both renderers use this filter:
// erasing such world features would silently remove non-state geography.
// This is a name-scope guard, not a historical polygon or date correction.
const LOCAL_ENGLISH = /^(?:(?:city|municipality|district|region|oblast|province|governorate|county) of (?:moscow|vladimir|russia)|(?:moscow|vladimir|russian|russia) (?:city|municipality|district|region|oblast|province|governorate|county))$/i;
const LOCAL_CYRILLIC = /^(?:(?:город|район|область|округ|губерния)\\s+(?:москва|владимир|россия)|(?:московск[а-яё]*|владимирск[а-яё]*|русск[а-яё]*|российск[а-яё]*)\\s+(?:город|район|область|округ|губерния))$/i;
function isExplicitLocalUnit(name) {
  const trimmed = name.trim();
  return LOCAL_ENGLISH.test(trimmed) || LOCAL_CYRILLIC.test(trimmed);
}
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
// obsolete *separate sovereign* background fill from May 1500 when a
// Gregorian month is provided, or from 1501 for year-only callers.
// This does not erase the appanage from history or certify History Core borders.
// Source: https://bigenc.ru/c/novgorod-severskoe-kniazhestvo-e28685
const SEVERSKY_ENGLISH = /^(?:(?:principality|duchy) of )?novgorod[- ](?:seversky|seversk|siversky|siversk)(?: principality)?$/i;
const SEVERSKY_CYRILLIC = /^новгород[- ]северск[а-яё]*(?: княжество)?$/i;

// The pinned 1500 Historical Basemaps world snapshot explicitly names
// Pskov and Ryazan as separate polities and is reused until the 1530
// snapshot. Pskov was annexed in January 1510, Ryazan in 1521. Do not
// paint those *stale background* polygons as independent after annexation.
// For Ryazan, the archive does not establish a legal annexation month.
// Documentary controls establish Moscow's administration by the END of
// September 1521 (Gregorian); earlier 1521 months remain uncertain.
// Year-only callers conservatively retain the entire transition year.
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
// Only May 1500 and September 1521 change the background identity within a
// year. Consumers can use this phase in memo/effect dependencies so that
// ordinary month scrubbing does not rebuild large world textures needlessly.
export function worldBackgroundTransitionPhase(year, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  return year === 1500 ? Number(month >= 5) : year === 1521 ? Number(month >= 9) : 0;
}

export function isRussianWorldFeature(feature, selectedYear = null, selectedMonth = null) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== 'object') return false;
  const hasMonth = Number.isInteger(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12;
  return NAME_FIELDS.some(key => {
    const name = properties[key];
    if (typeof name !== 'string') return false;
    if (isExplicitLocalUnit(name)) return false;
    if (ENGLISH.test(name) || CYRILLIC.test(name)) return true;
    if (PSKOV_ENGLISH.test(name.trim()) || PSKOV_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && selectedYear >= 1510;
    }
    if (RYAZAN_ENGLISH.test(name.trim()) || RYAZAN_CYRILLIC.test(name.trim())) {
      // A September 1521 cutoff denotes confirmed control by month end,
      // not a fabricated legal annexation date. Year-only calls stay cautious.
      return Number.isInteger(selectedYear) && (selectedYear >= 1522
        || (selectedYear === 1521 && hasMonth && selectedMonth >= 9));
    }
    if (SEVERSKY_ENGLISH.test(name.trim()) || SEVERSKY_CYRILLIC.test(name.trim())) {
      return Number.isInteger(selectedYear) && (selectedYear >= 1501
        || (selectedYear === 1500 && hasMonth && selectedMonth >= 5));
    }
    if (NOVGOROD_ENGLISH.test(name.trim()) || NOVGOROD_CYRILLIC.test(name.trim())) {
      // 1136–1477: the Novgorod Republic is separate world context.
      // 1478+: do not paint a stale Novgorod world polygon over Moscow.
      return !(Number.isInteger(selectedYear) && selectedYear >= 1136 && selectedYear < 1478);
    }
    return false;
  });
}
