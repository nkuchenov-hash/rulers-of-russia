import { chromium } from 'playwright';

const url = process.env.TERRITORY_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/territory/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const historyRequests = [];
const pageErrors = [];
page.on('request', request => {
  const requestUrl = request.url();
  if (requestUrl.includes('/data/history-core/')) historyRequests.push(requestUrl);
});
page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));

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

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response?.ok()) throw new Error(`Territory HTTP failed: ${response?.status()}`);
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core'), null, { timeout: 30000 });

  const monthSelect = page.getByLabel('Месяц');
  await monthSelect.selectOption('7');

  const changed = await page.evaluate(({year, minYear, yearPx}) => {
    const candidates = [...document.querySelectorAll('div')]
      .filter(el => el.scrollWidth - el.clientWidth > 5000 && el.clientWidth > 500);
    const timeline = candidates.sort((a,b) => (b.scrollWidth-b.clientWidth) - (a.scrollWidth-a.clientWidth))[0];
    if (!timeline) return null;
    timeline.scrollLeft = (year - minYear) * yearPx;
    timeline.dispatchEvent(new Event('scroll', {bubbles: true}));
    return {scrollLeft: timeline.scrollLeft, max: timeline.scrollWidth - timeline.clientWidth};
  }, {year: 1988, minYear: 862, yearPx: 6});
  if (!changed) throw new Error('Historical timeline scroll viewport not found');

  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 1988-07'), null, { timeout: 12000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('проверенная госграница: 4'), null, { timeout: 12000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('морское разграничение: 6'), null, { timeout: 12000 });
  await page.waitForTimeout(1200);

  for (const file of required1988Geometry) {
    if (!historyRequests.some(requestUrl => requestUrl.includes(`/data/history-core/geometry/${file}`))) {
      throw new Error(`1988 globe did not request verified History Core geometry ${file}: ${JSON.stringify(historyRequests)}`);
    }
  }
  if (pageErrors.length) throw new Error(`1988 browser page errors:\n${pageErrors.join('\n---\n')}`);

  const summary = await page.evaluate(() => ({
    text: document.body?.innerText?.slice(0, 1000) || '',
    canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width,c.height] : null; })()
  }));
  if (!summary.canvas) throw new Error('1988 WebGL canvas missing');
  console.log('Territory History Core 1988 browser acceptance passed:', JSON.stringify({changed, summary}));
} finally {
  await browser.close();
}
