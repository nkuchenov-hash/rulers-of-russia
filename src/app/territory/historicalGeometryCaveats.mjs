// A History Core "geometry-verified" snapshot is not evidence that a reused
// contour reflects all later territorial transitions. Keep these warnings tied
// to the actual 1462/1505 geometry files so dated replacements clear them.
const MOSCOW_1462_FILE = /(?:^|\/)base-grand-moscow-end-1462-1462-12-01\.geojson$/;
const MOSCOW_1505_FILE = /(?:^|\/)base-grand-moscow-end-1505-1505-12-01\.geojson$/;

export function historicalGeometryCaveat(date, monthState) {
  if (!date || monthState?.status !== 'geometry-verified') return null;
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || date.month < 1 || date.month > 12) return null;
  const key = `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}`;

  // The 1462 Tornau Moscow contour is reused until 1504-12. These
  // independently documented acquisitions occurred AFTER its source date.
  // The National Atlas of Russia, vol. 1, documents the remaining Rostov
  // share acquired in 1474, Tver in 1485, and Vyatka in 1489:
  // https://nationalatlas.ru/tom1/19.html
  // The atlas supplies YEARS, not effective months for Rostov and Vyatka;
  // therefore their warnings begin the following January. No polygon or
  // precise legal date is inferred from those year-only references.
  // Tver surrendered on 12 September 1485 (Julian; still September
  // proleptic Gregorian), per the Russian Historical Society's account:
  // https://history.ru/read/articles/prisoiedinieniie-tvierskogho-vielikogho-kniazhiestva-k-moskvie-event
  // Novgorod surrendered on 15 January 1478 (Julian; still January
  // proleptic Gregorian), per the Novgorod Regional Scientific Library:
  // https://nounb.ru/virtualnye-vystavki/personazhi-novgorodskoj-istorii-na-pamyatnike-tysyacheletie-rossii-2/ivan-iii-1440-1505-velikij-knyaz-moskovskij
  // All cutoffs describe stale source geometry, NOT validated borders.
  if (key >= '1463-01' && key <= '1504-12' && MOSCOW_1462_FILE.test(String(monthState.geometryFile ?? ''))) {
    const missing = [];
    if (key >= '1475-01') missing.push({desktop: 'приобретение ростовских земель (1474)', mobile: 'Ростов (1474)'});
    if (key >= '1478-01') missing.push({desktop: 'присоединение Новгорода (1478)', mobile: 'Новгород (1478)'});
    if (key >= '1485-09') missing.push({desktop: 'присоединение Твери (1485)', mobile: 'Тверь (1485)'});
    if (key >= '1490-01') missing.push({desktop: 'подчинение Вятки (1489)', mobile: 'Вятка (1489)'});
    const changes = missing.length ? `; не отражены изменения: ${missing.map(item => item.desktop).join(', ')}` : '';
    return {
      code: 'muscovy-1462-reused',
      desktop: `Контур 1462 г. повторно используется для ${key}${changes}; соответствие выбранному месяцу независимо не подтверждено`,
      mobile: `Контур 1462 г. · ${missing.length ? `не отражены ${missing.map(item => item.mobile).join(', ')} · ` : ''}точность не подтверждена`,
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
