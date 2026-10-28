// A History Core "geometry-verified" snapshot is not evidence that a reused
// contour reflects all later territorial transitions. Keep this warning tied
// to the actual 1505 geometry file so a future dated replacement clears it.
const MOSCOW_1462_FILE = /(?:^|\/)base-grand-moscow-end-1462-1462-12-01\.geojson$/;
const MOSCOW_1505_FILE = /(?:^|\/)base-grand-moscow-end-1505-1505-12-01\.geojson$/;

export function historicalGeometryCaveat(date, monthState) {
  if (!date || monthState?.status !== 'geometry-verified') return null;
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || date.month < 1 || date.month > 12) return null;
  const key = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}`;

  // The explicitly dated 1462 Tornau state is carried through 1504-12.
  // Novgorod's annexation in 1478 is not present in a 1462 Moscow contour.
  // The world-background filter also suppresses obsolete independent
  // Novgorod from 1478, so this gap must never be labelled verified.
  // A year-only source cannot certify an effective month within 1478.
  if (key >= '1463-01' && key <= '1504-12' && MOSCOW_1462_FILE.test(String(monthState.geometryFile ?? ''))) {
    const missing = date.year > 1478 ? '; не отражено присоединение Новгорода (1478)' : '';
    return {
      code: 'muscovy-1462-reused',
      desktop: `Контур 1462 г. повторно используется для ${key}${missing}; соответствие выбранному месяцу независимо не подтверждено`,
      mobile: `Контур 1462 г. · ${date.year > 1478 ? 'не отражён Новгород (1478) · ' : ''}точность не подтверждена`,
    };
  }
  if (key < '1506-01' || key > '1532-12') return null;
  if (!MOSCOW_1505_FILE.test(String(monthState.geometryFile ?? ''))) return null;

  const missing = [];
  // Event years are known, but exact effective months are not certified here.
  // Only name an omitted event after its entire calendar year has passed.
  if (date.year > 1510) missing.push('Псков (1510)');
  if (date.year > 1514) missing.push('Смоленск (1514)');
  // The 1505 Moscow contour also predates the annexation of Ryazan in 1521.
  // As with Pskov/Smolensk, year-only evidence is insufficient to assert an
  // exact transition month, so report it only from the following calendar year.
  // https://bigenc.ru/c/rossiia-istoriia-russkoe-gosudarstvo-obrazovanie-stanovlenie-formirovanie-territorii-i-ebc93b
  // https://nationalatlas.ru/tom1/20-22.html
  if (date.year > 1521) missing.push('Рязань (1521)');
  const changes = missing.length ? `; не отражены изменения: ${missing.join(', ')}` : '';
  return {
    code: 'muscovy-1505-reused',
    desktop: `Контур 1505 г. повторно используется для ${key}${changes}; соответствие выбранному месяцу независимо не подтверждено`,
    mobile: `Контур 1505 г. · ${missing.length ? `не отражены ${missing.join(', ')} · ` : ''}точность не подтверждена`,
  };
}
