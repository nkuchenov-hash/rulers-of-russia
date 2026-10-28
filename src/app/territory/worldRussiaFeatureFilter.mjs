// The world archive is only background context. Its Russian/Soviet polygons
// must not be drawn over the month-resolved History Core state. Historical
// Basemaps and Natural Earth can supply different name fields and languages.
// Inspect aliases independently: a Russian NAME_RU must not hide an English
// NAME, and vice versa. PARTOF is deliberately excluded: a non-Russian polity
// can have Russian suzerainty without being the Russian state polygon.
const NAME_FIELDS = ['NAME_RU', 'name_ru', 'RU_NAME', 'NAME', 'name', 'ADMIN', 'entity', 'polity', 'ABBREVN', 'SUBJECTO'];
const ENGLISH = /\b(?:russia|russian|soviet|ussr|rsfsr|union of soviet socialist republics|kievan rus|rus|muscovy|moscow|novgorod|vladimir)\b/i;
const CYRILLIC = /(?:^|[^а-яё])(?:россия|российск[а-яё]*|русск[а-яё]*|русь|ссср|рсфср|советск[а-яё]*|московия|московск[а-яё]*|новгородск[а-яё]*|владимирск[а-яё]*)(?=$|[^а-яё])/i;

export function isRussianWorldFeature(feature) {
  const properties = feature?.properties;
  if (!properties || typeof properties !== 'object') return false;
  return NAME_FIELDS.some(key => {
    const name = properties[key];
    return typeof name === 'string' && (ENGLISH.test(name) || CYRILLIC.test(name));
  });
}
