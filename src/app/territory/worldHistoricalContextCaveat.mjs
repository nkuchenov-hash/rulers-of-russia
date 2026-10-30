// Historical Basemaps' pinned world_1400.geojson contains Novgorod but
// no separately identified Tver polity. Its 1400 snapshot is reused through
// 1491 (the next snapshot is 1492). Do not silently imply that the world
// background is a complete atlas of independent principalities.
// Tver remained independent until its September 1485 surrender.
// https://bigenc.ru/c/tverskoe-kniazhestvo-02a7e2
// https://history.ru/read/articles/prisoiedinieniie-tvierskogho-vielikogho-kniazhiestva-k-moskvie-event
// This is a disclosure about BACKGROUND completeness, not a History Core
// geometry correction or a claim that the unprovided Tver polygon is known.
export function worldHistoricalContextCaveat(date, snapshotYear) {
  if (!Number.isInteger(date?.year) || !Number.isInteger(date?.month)
    || date.month < 1 || date.month > 12 || !Number.isInteger(snapshotYear)) return null;
  const beforeTverAnnexation = date.year < 1485 || (date.year === 1485 && date.month < 9);
  if (snapshotYear === 1400 && date.year >= 1400 && beforeTverAnnexation) {
    return 'Мировой фон 1400 г. неполон: самостоятельное Тверское княжество не выделено';
  }
  return null;
}
