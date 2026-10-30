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
  // The pinned 1500 background continues to show Novgorod-Seversky as a
  // separate polity. Its prince transferred allegiance to Moscow in May 1500,
  // while the dependent appanage survived until 1523. A year-level world
  // snapshot cannot show both political statuses correctly. The Russian
  // sovereign overlay suppresses the obsolete independent fill from 1501,
  // but this note preserves the distinction between suzerainty and abolition.
  // https://bigenc.ru/c/novgorod-severskoe-kniazhestvo-e28685
  // The 1500 world snapshot remains the selected background until 1529.
  // Ending this disclosure in 1523 would imply that the 1524–1529 source
  // suddenly became current, even though it still contains the obsolete
  // Novgorod-Seversky polity. The separate sovereign fill is suppressed by
  // worldRussiaFeatureFilter; neither that filter nor this note supplies a
  // replacement dated polygon.
  if (snapshotYear === 1500 && date.year >= 1500 && date.year < 1530) {
    return date.year <= 1523
      ? 'Мировой фон 1500 г. не отражает переход Новгород-Северского княжества под власть Москвы в 1500 г.; зависимый удел сохранялся до 1523 г.'
      : 'Мировой фон 1500 г. устарел: Новгород-Северский удел упразднён в 1523 г.; его отдельный контур в исходном снимке скрыт.';
  }
  if (snapshotYear !== 1400 || date.year < 1400 || date.year >= 1492) return null;
  const beforeTverAnnexation = date.year < 1485 || (date.year === 1485 && date.month < 9);
  return beforeTverAnnexation
    ? 'Мировой фон 1400 г. неполон: Тверское княжество и Псковская земля не выделены'
    : 'Мировой фон 1400 г. неполон: Псковская земля не выделена';
}
