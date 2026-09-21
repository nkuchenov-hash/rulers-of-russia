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
page.on('request', request => {
  const requestUrl = request.url();
  if (requestUrl.includes('/data/history-core/')) historyRequests.push(requestUrl);
  if (requestUrl.includes('/data/territory/archive/manifest.json')) legacyArchiveRequests.push(requestUrl);
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

async function selectHistoricalDate(year, month) {
  const changed = await page.evaluate(({year, minYear, yearPx}) => {
    const monthSelect = document.querySelector('select[aria-label="Месяц"]');
    const timelineSection = monthSelect?.closest('section');
    const candidates = [...(timelineSection?.querySelectorAll('div') ?? [])]
      .filter(el => el.scrollWidth - el.clientWidth > 5000 && el.clientWidth > 500);
    const timeline = candidates.sort((a,b) => (b.scrollWidth-b.clientWidth) - (a.scrollWidth-a.clientWidth))[0];
    if (!timeline) return null;
    const left = (year - minYear) * yearPx;
    timeline.scrollTo({left, behavior: 'auto'});
    timeline.dispatchEvent(new Event('scroll', {bubbles: true}));
    return {scrollLeft: timeline.scrollLeft, max: timeline.scrollWidth - timeline.clientWidth, left};
  }, {year, minYear: 862, yearPx: 6});
  if (!changed) throw new Error('Historical timeline scroll viewport not found');

  await page.waitForFunction((expectedYear) => {
    const text = document.querySelector('main aside b')?.textContent ?? '';
    return new RegExp(`\\b${expectedYear}$`).test(text.trim());
  }, year, {timeout: 12000});

  const monthSelect = page.getByLabel('Месяц');
  await monthSelect.selectOption(String(month));
  const expectedKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  await page.waitForFunction((key) => document.body?.innerText?.includes(`History Core ${key}`), expectedKey, { timeout: 12000 });
  return changed;
}

async function accuracyCaption() {
  return page.evaluate(() => document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '');
}

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response?.ok()) throw new Error(`Territory HTTP failed: ${response?.status()}`);
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core'), null, { timeout: 30000 });

  const changed1988 = await selectHistoricalDate(1988, 7);
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
  const changed1573 = await selectHistoricalDate(1573, 7);
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
  const changed1581 = await selectHistoricalDate(1581, 7);
  await page.waitForFunction(() => {
    const text = document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '';
    return text.includes('неопределённость реконструкции ≈220 км');
  }, null, {timeout: 12000});

  // A successful canonical historical path must not touch the legacy bootstrap
  // archive. The accuracy guard intercepts any attempted fallback before network.
  if (legacyArchiveRequests.length) {
    throw new Error(`Historical globe attempted legacy archive fallback: ${JSON.stringify(legacyArchiveRequests)}`);
  }

  if (pageErrors.length) throw new Error(`Historical browser page errors:\n${pageErrors.join('\n---\n')}`);

  const summary = await page.evaluate(() => ({
    text: document.body?.innerText?.slice(0, 1600) || '',
    accuracyCaption: document.querySelector('main aside p')?.getAttribute('data-history-accuracy-caption') ?? '',
    canvas: (() => { const c = document.querySelector('canvas'); return c ? [c.width,c.height] : null; })()
  }));
  if (!summary.canvas) throw new Error('Historical WebGL canvas missing');
  console.log('Territory historical accuracy browser acceptance passed:', JSON.stringify({changed1988, changed1573, changed1581, summary}));
} finally {
  await browser.close();
}
