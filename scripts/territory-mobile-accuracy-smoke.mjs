import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url = process.env.TERRITORY_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/territory/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});

try {
  for (const width of [390, 360]) {
    const page = await browser.newPage({
      viewport: {width, height: 844},
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const target = new URL(url);
    target.searchParams.set('year', '1581');
    target.searchParams.set('month', '7');
    const response = await page.goto(target.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(response?.ok(), `mobile ${width}: HTTP ${response?.status()}`);

    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      const caption = p?.getAttribute('data-history-mobile-caption') || '';
      return (document.body?.innerText || '').includes('History Core 1581-07')
        && caption.includes('Реконструкция')
        && caption.includes('220 км');
    }, null, {timeout: 45000});

    const metrics = await page.evaluate(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      const story = document.querySelector('main aside');
      const zoom = document.querySelector('main div[class*="zoomTools"]');
      const headerButtons = [...document.querySelectorAll('main header button')];
      const bounds = el => {
        const rect = el?.getBoundingClientRect();
        return rect ? {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width} : null;
      };
      return {
        width: window.innerWidth,
        docWidth: document.documentElement.scrollWidth,
        statusVisible: getComputedStyle(p).display !== 'none' && p.getBoundingClientRect().height > 0,
        textSize: parseFloat(getComputedStyle(p, '::after').fontSize),
        status: p?.getAttribute('data-history-mobile-caption'),
        statusBounds: bounds(p),
        storyBounds: bounds(story),
        zoomBounds: bounds(zoom),
        buttons: headerButtons.map(bounds),
      };
    });

    assert(metrics.statusVisible, `mobile ${width}: historical uncertainty hidden`);
    assert(metrics.textSize >= 16, `mobile ${width}: unreadable ${metrics.textSize}px status`);
    assert(metrics.docWidth <= width + 1, `mobile ${width}: horizontal page overflow to ${metrics.docWidth}px`);
    assert(metrics.statusBounds.right < metrics.zoomBounds.left,
      `mobile ${width}: historical caption covers the zoom controls: ${JSON.stringify(metrics)}`);
    assert(metrics.buttons.every(box => box.left >= -1 && box.right <= width + 1),
      `mobile ${width}: top actions clipped: ${JSON.stringify(metrics)}`);

    const month = page.getByLabel('Месяц');
    await month.selectOption('8');
    await page.waitForFunction(() => (document.body?.innerText || '').includes('History Core 1581-08'), null, {timeout: 30000});
    assert.equal(errors.length, 0, `mobile ${width}: page errors ${errors.join('; ')}`);
    console.log(`Mobile territory ${width}px passed:`, JSON.stringify(metrics));
    await page.close();
  }
} finally {
  await browser.close();
}
