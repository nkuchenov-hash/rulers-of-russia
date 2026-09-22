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

  // Prove fail-closed behavior. Block the canonical full-state geometry for a
  // fresh date. The UI must explicitly hide Russia rather than make any legacy
  // archive request or silently substitute bootstrap geometry.
  let blockedCanonicalGeometry = 0;
  const generatedTerritoryPattern = '**/data/history-core/generated/territory/**';
  await page.route(generatedTerritoryPattern, async route => {
    blockedCanonicalGeometry += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({error: 'intentional-history-core-smoke-failure'})
    });
  });
  const failClosedTarget = new URL(url);
  failClosedTarget.searchParams.set('year', '1987');
  failClosedTarget.searchParams.set('month', '7');
  const failClosedResponse = await page.goto(failClosedTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
  if (!failClosedResponse?.ok()) throw new Error(`Fail-closed territory page HTTP failed: ${failClosedResponse?.status()}`);
  await page.waitForFunction(() => {
    const text = document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '';
    return text.includes('History Core: геометрия недоступна — граница России скрыта');
  }, null, {timeout: 30000});
  await page.unroute(generatedTerritoryPattern);
  if (!blockedCanonicalGeometry) {
    throw new Error('Fail-closed smoke did not intercept canonical generated territory geometry');
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
  console.log('Territory historical accuracy browser acceptance passed:', JSON.stringify({changed1988, changed1573, changed1581, blockedCanonicalGeometry, summary}));
} finally {
  await browser.close();
}
