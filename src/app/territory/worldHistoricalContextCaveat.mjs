// Historical Basemaps' pinned world_1400.geojson contains Novgorod but
// neither a separately named Tver polity nor Pskov. Its 1400 snapshot is
// reused through 1491 (the next snapshot is 1492). Do not imply that this
// background is a complete atlas of medieval principalities.
// Tver surrendered in September 1485; Pskov retained its own institutions
// until its incorporation into Moscow in January 1510. Pskov's increasing
// dependence on Moscow must not be mistaken for an already drawn boundary.
// https://bigenc.ru/c/tverskoe-kniazhestvo-02a7e2
// https://history.ru/read/articles/prisoiedinieniie-tvierskogho-vielikogho-kniazhiestva-k-moskvie-event
// https://old.bibliopskov.ru/pskov1510.htm
// This is a disclosure about BACKGROUND completeness, not a History Core
// geometry correction or a claim that the missing polygons are known.
export function worldHistoricalContextCaveat(date, snapshotYear) {
  if (!Number.isInteger(date?.year) || !Number.isInteger(date?.month)
    || date.month < 1 || date.month > 12 || !Number.isInteger(snapshotYear)) return null;
  if (snapshotYear !== 1400 || date.year < 1400 || date.year >= 1492) return null;
  const beforeTverAnnexation = date.year < 1485 || (date.year === 1485 && date.month < 9);
  return beforeTverAnnexation
    ? 'Мировой фон 1400 г. неполон: Тверское княжество и Псковская земля не выделены'
    : 'Мировой фон 1400 г. неполон: Псковская земля не выделена';
}
