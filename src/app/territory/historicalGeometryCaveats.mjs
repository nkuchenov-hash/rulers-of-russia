// A History Core "geometry-verified" snapshot is not evidence that a reused
// contour reflects all later territorial transitions. Keep these warnings tied
// to the actual 1462/1505 geometry files so dated replacements clear them.
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
  // Novgorod Regional Scientific Library dates the surrender to 15 January
  // 1478 (Julian; still January in the proleptic Gregorian calendar). Since
  // the UI displays the state at month end, warn from 1478-01, not 1479-01.
  // https://nounb.ru/virtualnye-vystavki/personazhi-novgorodskoj-istorii-na-pamyatnike-tysyacheletie-rossii-2/ivan-iii-1440-1505-velikij-knyaz-moskovskij
  // This dates the missing transition, NOT the contour or its precise shape.
  if (key >= '1463-01' && key <= '1504-12' && MOSCOW_1462_FILE.test(String(monthState.geometryFile ?? ''))) {
    const missing = key >= '1478-01' ? '; не отражено присоединение Новгорода (1478)' : '';
    return {
      code: 'muscovy-1462-reused',
      desktop: `Контур 1462 г. повторно используется для ${key}${missing}; соответствие выбранному месяцу независимо не подтверждено`,
      mobile: `Контур 1462 г. · ${key >= '1478-01' ? 'не отражён Новгород (1478) · ' : ''}точность не подтверждена`,
    };
  }
  if (key < '1506-01' || key > '1532-12') return null;
  if (!MOSCOW_1505_FILE.test(String(monthState.geometryFile ?? ''))) return null;

  const missing = [];
  // Pskov's veche was abolished on 13 January 1510 (Julian; Gregorian
  // January), per the Pskov regional government and Russian Historical Society.
  // https://pskov.ru/region/istoriya/prisoedinenie-k-moskve
  // https://historyrussia.org/sobytiya/13-yanvarya-1510-goda-v-pskove-byl-snyat-vechevoj-kolokol.html
  // Smolensk surrendered 30–31 July 1514 (Julian = 9–10 August Gregorian);
  // see A. N. Lobin, Vziatie Smolenska i bitva pod Orshei, 2015.
  // https://djvu.online/file/zhlXoOVvyW3TJ
  // These dates justify when the unchanged 1505 contour is stale, not a
  // replacement boundary. UI dates represent the END of the selected month.
  if (key >= '1510-01') missing.push('Псков (1510)');
  if (key >= '1514-08') missing.push('Смоленск (1514)');
  // The 1505 Moscow contour also predates the change of control over
  // Ryazan in 1521. An archival study documents the last prince's July
  // flight and the 31 August (Julian) investigation; regional historical
  // accounts place a Moscow governor and loyal garrison in Ryazan in August.
  // By the END of September (including the Gregorian conversion of late
  // August Julian dates), the 1505 contour is demonstrably stale. The exact
  // legal effective month and replacement boundary remain unestablished:
  // this is a warning cutoff, NOT a claimed September annexation date.
  // https://www.vostlit.info/Texts/Dokumenty/Litva/XVI/1520-1540/Ivan_Ivanovic_Rjazaskij/text.htm
  // https://www.docs.historyrussia.org/ru/nodes/344564-1521-avgusta-31-otryvok-rozysknogo-dela-o-begstve-iz-moskvy-ryazanskogo-knyazya-ioanna-ioannovicha
  // https://62info.ru/history/node/332
  // https://www.rzn.info/articles/pochemu-ryazan-prisoedinili-k-moskve-500-let-nazad.html
  if (key >= '1521-09') missing.push('Рязань (1521)');
  const changes = missing.length ? `; не отражены изменения: ${missing.join(', ')}` : '';
  return {
    code: 'muscovy-1505-reused',
    desktop: `Контур 1505 г. повторно используется для ${key}${changes}; соответствие выбранному месяцу независимо не подтверждено`,
    mobile: `Контур 1505 г. · ${missing.length ? `не отражены ${missing.join(', ')} · ` : ''}точность не подтверждена`,
  };
}
