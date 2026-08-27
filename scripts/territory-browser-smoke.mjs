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
  await page.waitForFunction(() => document.body?.innerText?.includes('реконструкция · достоверность'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('проверенных участков 2'), null, { timeout: 8000 });
  const monthSelect = page.getByLabel('Месяц');
  if (await monthSelect.count() !== 1) throw new Error('History Core month selector missing');

  const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const buttons = [...document.querySelectorAll('button')].map(x => x.textContent?.trim()).filter(Boolean);
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      buttons,
      bodyText: document.body?.innerText?.slice(0, 900) || ''
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
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-norway-varanger-2008-p1-p6.geojson'))) {
    throw new Error(`Globe did not request Varangerfjord geometry-verified boundary fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/geometry/rf-norway-delimitation-2011-p1-p8.geojson'))) {
    throw new Error(`Globe did not request Barents geometry-verified boundary fragment: ${JSON.stringify(historyRequests)}`);
  }
  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/') && !requestUrl.endsWith('/month-index.json') && !requestUrl.endsWith('/verified-boundaries.json'))) {
    throw new Error(`Globe did not request month-resolved History Core territory geometry: ${JSON.stringify(historyRequests)}`);
  }
  await monthSelect.selectOption('2');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 2026-02'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('проверенных участков 2'), null, { timeout: 8000 });

  const eraSelect = page.getByLabel('Быстрый переход к эпохе');
  if (await eraSelect.count() !== 1) throw new Error('Era selector missing');
  await eraSelect.selectOption('862');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 0862-02'), null, { timeout: 8000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('поздний proxy'), null, { timeout: 8000 });
  await eraSelect.selectOption('1992');
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 1992-02'), null, { timeout: 8000 });

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

  console.log('Territory browser smoke passed:', JSON.stringify(state));
} finally {
  await browser.close();
}
