import { chromium } from 'playwright';

const url = process.env.TERRITORY_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/territory/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];
const historyRequests = [];
page.on('request', request => {
  const requestUrl = request.url();
  if (requestUrl.includes('/data/history-core/')) historyRequests.push(requestUrl);
});
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const visibleLabelWithPrefix = prefix => [...document.querySelectorAll('div')].some(el => {
  const text = el.textContent?.trim() || '';
  if (!text.startsWith(prefix)) return false;
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
});

const visibleCountryLabel = () => [...document.querySelectorAll('[data-country-label="true"]')].some(el => {
  const style = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
});

const waitForHistoryStateStatus = async () => {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return text.includes('проверенная геометрия') || text.includes('реконструкция · достоверность');
  }, null, { timeout: 8000 });
};

const waitForCurrentVerifiedTracks = async () => {
  await page.waitForFunction(() => document.body?.innerText?.includes('проверенная госграница: 2'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('морское разграничение: 2'), null, { timeout: 8000 });
};

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || !response.ok()) throw new Error(`Territory HTTP failed: ${response?.status()}`);

  await page.waitForFunction(() => document.body?.innerText?.includes('Рельеф'), null, { timeout: 20000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return Boolean(canvas && canvas.width > 300 && canvas.height > 200);
  }, null, { timeout: 30000 });
  await page.waitForTimeout(4500);
  await page.waitForFunction(visibleCountryLabel, null, { timeout: 5000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core'), null, { timeout: 8000 });
  await waitForHistoryStateStatus();
  await waitForCurrentVerifiedTracks();
  const monthSelect = page.getByLabel('Месяц');
  if (await monthSelect.count() !== 1) throw new Error('History Core month selector missing');

  const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const buttons = [...document.querySelectorAll('button')].map(x => x.textContent?.trim()).filter(Boolean);
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      buttons,
      bodyText: document.body?.innerText?.slice(0, 1000) || ''
    };
  });

  if (!state.canvas) throw new Error('WebGL canvas did not mount');
  if (!state.buttons.includes('Рельеф') || !state.buttons.includes('Государства')) {
    throw new Error(`Territory controls missing: ${JSON.stringify(state.buttons)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/month-index.json'))) {
    throw new Error(`Globe did not request History Core month index: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/verified-boundaries.json'))) {
    throw new Error(`Globe did not request verified History Core boundary index: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-lithuania-maritime-2003-p1-p3.geojson'))) {
    throw new Error(`Globe did not request Lithuania maritime-jurisdiction fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-norway-varanger-2008-p1-p6.geojson'))) {
    throw new Error(`Globe did not request Varangerfjord state-border fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-norway-delimitation-2011-p1-p8.geojson'))) {
    throw new Error(`Globe did not request Barents maritime-jurisdiction fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-dprk-territorial-sea-2013.geojson'))) {
    throw new Error(`Globe did not request DPRK state-border fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/') && !requestUrl.endsWith('/month-index.json') && !requestUrl.endsWith('/verified-boundaries.json'))) {
    throw new Error(`Globe did not request month-resolved History Core territory geometry: ${JSON.stringify(historyRequests)}`);
  }
  await monthSelect.selectOption('2');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 2026-02'), null, { timeout: 8000 });
  await waitForHistoryStateStatus();
  await waitForCurrentVerifiedTracks();

  const eraSelect = page.getByLabel('Быстрый переход к эпохе');
  if (await eraSelect.count() !== 1) throw new Error('Era selector missing');
  await eraSelect.selectOption('862');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 0862-02'), null, { timeout: 8000 });
  await waitForHistoryStateStatus();
  await eraSelect.selectOption('1992');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 1992-02'), null, { timeout: 8000 });
  await waitForHistoryStateStatus();

  const flatButton = page.getByRole('button', {name: 'Показать плоскую карту'});
  await flatButton.click();
  const flatCanvas = page.locator('canvas[data-territory-flat-map="true"]');
  await flatCanvas.waitFor({state: 'visible', timeout: 10000});
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas[data-territory-flat-map="true"]');
    return canvas?.width > 300 && canvas?.height > 200
      && canvas.dataset.historyMonth === '1992-02';
  }, null, {timeout: 15000});
  const zoomBefore = Number(await flatCanvas.getAttribute('data-camera-zoom'));
  await page.getByRole('button', {name: '+', exact: true}).click();
  await page.waitForFunction(oldZoom => {
    const canvas = document.querySelector('canvas[data-territory-flat-map="true"]');
    return Number(canvas?.dataset.cameraZoom) > oldZoom;
  }, zoomBefore, {timeout: 8000});

  // The flat view must use the same month-resolved Russian polygon as the globe.
  await monthSelect.selectOption('3');
  await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1992-03', null, {timeout: 12000});
  await page.getByRole('button', {name: 'Государства', exact: true}).click();
  // Assert that the month-selected Russian territory is actually drawn in
  // the center of the atlas, not a blank ocean/equator despite a live canvas.
  // 88E,61N (1992 Russian Federation focus) is inside Russia, in Siberia.
  const centerRgb = await flatCanvas.evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    const {data} = ctx.getImageData(Math.floor(canvas.width/2), Math.floor(canvas.height/2), 1, 1);
    return [...data].slice(0, 3);
  });
  if (!(centerRgb[1] > centerRgb[0]+12 && centerRgb[1] > centerRgb[2]+20
    && centerRgb[0] >= 95 && centerRgb[0] <= 160)) {
    throw new Error(`Flat map did not paint the historical Russian polygon at its own focus: RGB ${JSON.stringify(centerRgb)}`);
  }
  await page.getByRole('button', {name: 'Рельеф', exact: true}).click();
  await page.getByRole('button', {name: 'Показать глобус'}).click();
  if (await flatCanvas.count()) throw new Error('Planar canvas persisted after switching to globe');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas');
    return Boolean(canvas&&canvas.width>300&&canvas.height>200);
  }, null, {timeout: 8000});

  const zoomIn = page.getByRole('button', { name: '+', exact: true });

  await zoomIn.click();
  await page.waitForTimeout(250);
  if (await page.evaluate(visibleLabelWithPrefix, '★')) {
    throw new Error('Capital labels appeared too early after the first zoom step');
  }

  await zoomIn.click();
  await page.waitForTimeout(250);
  await page.waitForFunction(visibleLabelWithPrefix, '★', { timeout: 5000 });

  await zoomIn.click();
  await page.waitForTimeout(250);
  await page.waitForFunction(visibleLabelWithPrefix, '•', { timeout: 5000 });

  if (pageErrors.length) throw new Error(`Browser pageerror:\n${pageErrors.join('\n---\n')}`);

  const fatalConsole = consoleErrors.filter(x => /ReferenceError|TypeError|SyntaxError|Uncaught|WebGL context lost|out of memory/i.test(x));
  if (fatalConsole.length) throw new Error(`Fatal browser console errors:\n${fatalConsole.join('\n---\n')}`);

  // Regression: a year change inside the same historical world snapshot must
  // not abort its pending fetch and permanently leave the world context blank.
  // 2025 and 2026 both use the 2010 archive snapshot.
  const racePage = await browser.newPage({viewport:{width:1280,height:800}});
  let releaseWorldFetch = () => {};
  const holdWorldFetch = new Promise(resolve => {releaseWorldFetch = resolve;});
  try {
    await racePage.route(/\/data\/territory\/world-history\/snapshots\/2010\.geojson(?:\?|$)/,
      async route => {await holdWorldFetch; await route.continue();});
    const raceUrl = new URL(url);
    raceUrl.searchParams.set('year','2026');
    raceUrl.searchParams.set('month','7');
    const pendingSnapshot = racePage.waitForRequest(
      request => /\/data\/territory\/world-history\/snapshots\/2010\.geojson(?:\?|$)/.test(request.url()),
      {timeout:20000});
    await racePage.goto(raceUrl.href,{waitUntil:'domcontentloaded',timeout:45000});
    await pendingSnapshot;
    await racePage.evaluate(() => {
      const timeline = document.querySelector('div[class*="rulerViewport"]');
      if(!timeline)throw new Error('Timeline viewport missing in snapshot race test');
      timeline.scrollLeft = (2025 - 862) * 6;
      timeline.dispatchEvent(new Event('scroll',{bubbles:true}));
    });
    await racePage.waitForFunction(() =>
      /2025/.test(document.querySelector('aside[class*="story"] b')?.textContent??''),
      null,{timeout:10000});
    releaseWorldFetch();
    await racePage.waitForFunction(() =>
      document.body?.innerText?.includes('Исторический мировой срез 2010 года'),
      null,{timeout:20000});
  } finally {
    releaseWorldFetch();
    await racePage.close();
  }

  console.log('Territory browser smoke passed:', JSON.stringify(state));
} catch (error) {
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1600) || '').catch(() => '');
  console.error('Territory smoke diagnostics:', JSON.stringify({ pageErrors, consoleErrors, historyRequests, bodyText }, null, 2));
  throw error;
} finally {
  await browser.close();
}
