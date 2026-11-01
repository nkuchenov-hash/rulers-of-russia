import { chromium } from 'playwright';

const url = process.env.TERRITORY_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/territory/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const historyRequests = [];
const legacyArchiveRequests = [];
const pageErrors = [];
const pageCrashes = [];
page.on('request', request => {
  const requestUrl = request.url();
  if (requestUrl.includes('/data/history-core/')) historyRequests.push(requestUrl);
  if (requestUrl.includes('/data/territory/archive/')) legacyArchiveRequests.push(requestUrl);
});
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('crash', () => pageCrashes.push('Chromium page crashed'));

const required1988Geometry = [
  'ussr-norway-varanger-1958-p1-p4.geojson',
  'ussr-finland-sea-frontier-1966.geojson',
  'ussr-finland-maritime-jurisdiction-1966.geojson',
  'ussr-finland-shelf-extension-1968.geojson',
  'ussr-turkey-territorial-sea-1975.geojson',
  'ussr-finland-fishing-extension-1980.geojson',
  'ussr-turkey-continental-shelf-1981.geojson',
  'ussr-poland-territorial-sea-1986.geojson',
  'ussr-poland-maritime-jurisdiction-1986.geojson',
  'ussr-sweden-maritime-1988-a1-a17.geojson'
];

async function exactDateDebug(expectedKey) {
  return page.evaluate((key) => {
    const monthSelect = document.querySelector('select[aria-label="Месяц"]');
    return {
      expectedKey: key,
      href: window.location.href,
      search: window.location.search,
      shownYear: monthSelect?.parentElement?.querySelector('b')?.textContent?.trim() ?? null,
      shownMonth: monthSelect?.value ?? null,
      bodyText: document.body?.innerText?.slice(0, 2200) ?? '',
      accuracyCaption: document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? null,
    };
  }, expectedKey);
}

async function loadHistoricalDate(year, month) {
  if (page.isClosed()) throw new Error(`Historical page closed before selecting ${year}-${month}`);
  const target = new URL(url);
  target.searchParams.set('year', String(year));
  target.searchParams.set('month', String(month));
  const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response?.ok()) throw new Error(`Territory HTTP failed for ${year}-${month}: ${response?.status()}`);

  const expectedKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  try {
    await page.waitForFunction((key) => document.body?.innerText?.includes(`History Core ${key}`), expectedKey, {timeout: 30000});
  } catch (error) {
    const debug = await exactDateDebug(expectedKey);
    throw new Error(`Exact-date link did not reach ${expectedKey}: ${JSON.stringify(debug)}\nPage errors: ${JSON.stringify(pageErrors)}\nRequests: ${JSON.stringify(historyRequests.slice(-30))}`, {cause: error});
  }
  await page.waitForFunction(({expectedYear, expectedMonth}) => {
    const monthSelect = document.querySelector('select[aria-label="Месяц"]');
    const shownYear = monthSelect?.parentElement?.querySelector('b')?.textContent?.trim();
    return shownYear === String(expectedYear) && monthSelect?.value === String(expectedMonth);
  }, {expectedYear: year, expectedMonth: month}, {timeout: 12000});
  if (pageCrashes.length) throw new Error(`${expectedKey}: ${pageCrashes.join('; ')}`);
  return {year, month, mode: 'exact-date-link', url: target.href};
}

async function accuracyCaption() {
  return page.evaluate(() => document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '');
}

try {
  const changed1988 = await loadHistoricalDate(1988, 7);
  await page.waitForFunction(() => document.body?.innerText?.includes('проверенная госграница: 4'), null, { timeout: 12000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('морское разграничение: 6'), null, { timeout: 12000 });
  await page.waitForTimeout(1200);

  for (const file of required1988Geometry) {
    if (!historyRequests.some(requestUrl => requestUrl.includes(`/data/history-core/geometry/${file}`))) {
      throw new Error(`1988 globe did not request verified History Core geometry ${file}: ${JSON.stringify(historyRequests)}`);
    }
  }

  // Imperial title: 22 October 1721 Julian = 2 November Gregorian.
  // The monthly timeline is Gregorian month-end; the title must not be
  // backdated to January, nor should the change imply a new border polygon.
  const beforeEmpire = await loadHistoricalDate(1721, 10);
  await page.waitForFunction(() =>
    document.querySelector('main aside h1')?.textContent?.trim() === 'Русское царство'
    && document.querySelector('main aside')?.getAttribute('data-history-loaded-month') === '1721-10',
  null, {timeout: 30000});
  await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
  await page.waitForFunction(() =>
    document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1721-10',
  null, {timeout: 15000});
  await page.getByLabel('Месяц').selectOption('11');
  await page.waitForFunction(() =>
    document.querySelector('main aside h1')?.textContent?.trim() === 'Российская империя'
    && (document.body?.innerText || '').includes('History Core 1721-11')
    && document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1721-11',
  null, {timeout: 30000});
  await page.getByRole('button', {name: 'Показать глобус'}).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('main div[class*="globeHost"] canvas');
    return canvas?.width > 300 && canvas?.height > 100
      && canvas.getBoundingClientRect().height > 100
      && document.querySelector('main aside')?.getAttribute('data-history-loaded-month') === '1721-11';
  }, null, {timeout: 15000});

  // History Core assigns January–November 1922 to RSFSR and December 1922
  // to the USSR. The displayed polity and both map projections must follow
  // the selected month, not just the calendar year.
  const preUnion = await loadHistoricalDate(1922, 11);
  await page.waitForFunction(() => document.querySelector('main aside h1')?.textContent?.trim() === 'Российская СФСР',
    null, {timeout: 12000});
  await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
  await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1922-11',
    null, {timeout: 15000});
  await page.getByLabel('Месяц').selectOption('12');
  await page.waitForFunction(() =>
    document.querySelector('main aside h1')?.textContent?.trim() === 'Союз Советских Социалистических Республик'
    && (document.body?.innerText || '').includes('History Core 1922-12')
    && document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1922-12',
  null, {timeout: 30000});
  await page.getByRole('button', {name: 'Показать глобус'}).click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector('main div[class*="globeHost"] canvas');
    return canvas?.width > 300 && canvas?.height > 100 && canvas.getBoundingClientRect().height > 100;
  }, null, {timeout: 12000});

  // January 1917 must not be mislabeled as the Russian Republic: the
  // month-index deliberately treats the entire year as transitional.
  const preRepublic = await loadHistoricalDate(1917, 1);
  await page.waitForFunction(() => document.querySelector('main aside h1')?.textContent?.trim() === 'Россия в 1917 году',
    null, {timeout: 12000});

  // The 1500 world snapshot is reused through 1529. The dependent
  // Novgorod-Seversky appanage ended in 1523, but that does not make the
  // old background accurate from 1524 onward. Check the visible disclosure
  // on both renderers, not merely the pure filtering helper.
  const changed1524 = await loadHistoricalDate(1524, 1);
  await page.waitForFunction(() =>
    document.querySelector('main aside [class*="worldContextWarning"]')?.textContent
      ?.includes('Новгород-Северский удел упразднён в 1523 г.'),
  null, {timeout: 15000});
  await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
  await page.waitForFunction(() =>
    document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1524-01'
    && document.querySelector('main aside [class*="worldContextWarning"]')?.textContent
      ?.includes('Новгород-Северский удел упразднён в 1523 г.'),
  null, {timeout: 15000});
  await page.getByRole('button', {name: 'Показать глобус'}).click();
  await page.waitForFunction(() =>
    document.querySelector('main div[class*="globeHost"] canvas')?.getBoundingClientRect().height > 100
    && document.querySelector('main aside [class*="worldContextWarning"]')?.textContent
      ?.includes('Новгород-Северский удел упразднён в 1523 г.'),
  null, {timeout: 15000});

  // Historical Basemaps has 1530 then 1600; 1573 must visibly identify 1530
  // as approximate temporal context rather than an exact 1573 world border.
  const changed1573 = await loadHistoricalDate(1573, 7);
  await page.waitForFunction(() => {
    const text = document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '';
    return text.includes('Мировой контекст: приблизительный срез 1530 года') && text.includes('43 лет до выбранной даты');
  }, null, {timeout: 12000});
  const caption1573 = await accuracyCaption();
  if (caption1573.includes('Исторический мировой срез 1530 года')) {
    throw new Error(`1573 accuracy caption still claims exact 1530 slice: ${caption1573}`);
  }

  // The 1581-1689 Tsardom certification has a 220 km uncertainty envelope. It
  // must stay explicit in the production UI even though completion certification
  // promotes the month into the geometry-verified History Core path.
  const changed1581 = await loadHistoricalDate(1581, 7);
  await page.waitForFunction(() => {
    const text = document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '';
    return text.includes('неопределённость реконструкции ≈220 км');
  }, null, {timeout: 12000});

  // Navigating without a page reload must never show 1581 contours under
  // a 1992 timeline. Hold the 1992 geometry request so this loading window
  // can be inspected deterministically.
  const pending1992Pattern = /\/data\/history-core\/generated\/territory\/[^?]+\.geojson(?:\?|$)/;
  let release1992Geometry = null;
  let resolve1992Intercept = null;
  let resolve1992RequestCompletion = null;
  const request1992Completed = new Promise(resolve => { resolve1992RequestCompletion = resolve; });
  const saw1992Intercept = new Promise(resolve => { resolve1992Intercept = resolve; });
  await page.route(pending1992Pattern, async route => {
    if (route.request().url().includes('/generated/territory/')) {
      await new Promise(resolve => {
        release1992Geometry = resolve;
        resolve1992Intercept?.();
      });
    }
    try { await route.continue(); }
    finally { resolve1992RequestCompletion?.(); }
  });
  try {
    await page.evaluate(() => {
      const ruler = document.querySelector('div[class*="rulerViewport"]');
      if (!ruler) throw new Error('Historical timeline missing');
      ruler.scrollLeft = (1992 - 862) * 6;
      ruler.dispatchEvent(new Event('scroll'));
    });
    await Promise.race([
      saw1992Intercept,
      new Promise((_, reject) => setTimeout(() => reject(new Error('1992 geometry request not intercepted during in-page timeline change')), 25000)),
    ]);
    await page.waitForFunction(() => {
      const aside = document.querySelector('main aside');
      return aside?.textContent?.includes('Июл 1992')
        && aside.getAttribute('data-history-loaded-month') === ''
        && aside.getAttribute('aria-busy') === 'true'
        && aside.textContent.includes('загрузка геометрии');
    }, null, {timeout: 15000});
    console.log('In-page 1581 -> 1992 transition hides stale Russian geometry until the new file loads.');
  } finally {
    if (release1992Geometry) {
      release1992Geometry();
      await request1992Completed;
    }
    await page.unroute(pending1992Pattern);
  }
  await page.waitForFunction(() => {
    const aside = document.querySelector('main aside');
    return aside?.getAttribute('data-history-loaded-month') === '1992-07'
      && aside.getAttribute('aria-busy') === 'false';
  }, null, {timeout: 30000});

  // Prove fail-closed behavior by intercepting a canonical generated
  // full-state geometry request. Use a FRESH isolated browser context:
  // the earlier in-page 1581 -> 1992 transition already loaded this exact
  // GeoJSON URL, so a second navigation in the same context can legitimately
  // reuse a browser-cached response without issuing an interceptable request.
  // That is not evidence that the map failed to load or failed closed.
  let blockedCanonicalGeometry = 0;
  let interceptedGeometryUrl = null;
  let resolveIntercept;
  const intercepted = new Promise(resolve => { resolveIntercept = resolve; });
  const generatedTerritoryPattern = /\/data\/history-core\/generated\/territory\/[^?]+\.geojson(?:\?|$)/;
  const failClosedPage = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
  const failClosedRequests = [];
  failClosedPage.on('request', request => {
    if (request.url().includes('/data/history-core/')) failClosedRequests.push(request.url());
  });
  failClosedPage.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  failClosedPage.on('crash', () => pageCrashes.push('Fail-closed Chromium page crashed'));
  try {
    await failClosedPage.route(generatedTerritoryPattern, async route => {
      blockedCanonicalGeometry += 1;
      interceptedGeometryUrl = route.request().url();
      resolveIntercept?.(interceptedGeometryUrl);
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({error: 'intentional-history-core-smoke-failure'})
      });
    });
    const failClosedTarget = new URL(url);
    failClosedTarget.searchParams.set('year', '1992');
    failClosedTarget.searchParams.set('month', '7');
    const failClosedResponse = await failClosedPage.goto(failClosedTarget.href,
      {waitUntil: 'domcontentloaded', timeout: 45000});
    if (!failClosedResponse?.ok()) {
      throw new Error(`Fail-closed territory page HTTP failed: ${failClosedResponse?.status()}`);
    }
    await Promise.race([
      intercepted,
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        `Fail-closed smoke saw no canonical generated geometry request in a fresh context. Recent History Core requests: ${JSON.stringify(failClosedRequests.slice(-30))}`
      )), 30000)),
    ]);
    await failClosedPage.waitForFunction(() => {
      const text = document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '';
      return text.includes('History Core: геометрия недоступна — граница России скрыта');
    }, null, {timeout: 30000});
    if (!blockedCanonicalGeometry || !interceptedGeometryUrl) {
      throw new Error('Fail-closed smoke did not intercept canonical generated territory geometry');
    }
  } finally {
    await failClosedPage.close();
  }

  if (legacyArchiveRequests.length) {
    throw new Error(`Historical globe reached legacy archive over the network: ${JSON.stringify(legacyArchiveRequests)}`);
  }

  if (pageErrors.length || pageCrashes.length) {
    throw new Error(`Historical browser errors:\n${[...pageErrors, ...pageCrashes].join('\n---\n')}`);
  }

  const summary = await page.evaluate(() => ({
    text: document.body?.innerText?.slice(0, 1600) || '',
    accuracyCaption: document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '',
    canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width,c.height] : null; })()
  }));
  if (!summary.canvas) throw new Error('Historical WebGL canvas missing');
  console.log('Territory historical accuracy browser acceptance passed:', JSON.stringify({changed1988, beforeEmpire, changed1524, changed1573, changed1581, blockedCanonicalGeometry, interceptedGeometryUrl, summary}));
} finally {
  await browser.close();
}
