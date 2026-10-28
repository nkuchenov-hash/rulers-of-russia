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

    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    const flat = page.locator('canvas[data-territory-flat-map="true"]');
    await flat.waitFor({state: 'visible', timeout: 10000});
    await page.waitForFunction(() => {
      const node=document.querySelector('canvas[data-territory-flat-map="true"]');
      return node?.width > 300 && node?.height > 100 && node?.dataset.historyMonth === '1581-07';
    }, null, {timeout: 15000});
    const mapBounds = await flat.boundingBox();
    assert(mapBounds && mapBounds.width >= width - 1,
      `mobile ${width}: flat map fails to fill the viewport: ${JSON.stringify(mapBounds)}`);
    assert(await page.getByRole('button', {name: 'Показать глобус'}).isVisible(),
      `mobile ${width}: cannot switch back to globe`);

    const month = page.getByLabel('Месяц');
    await month.selectOption('8');
    await page.waitForFunction(() => (document.body?.innerText || '').includes('History Core 1581-08'), null, {timeout: 30000});
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1581-08', null, {timeout: 12000});
    await page.getByRole('button', {name: 'Показать глобус'}).click();
    // The 1462 contour is reused across the 1478 annexation of Novgorod.
    // Both projections must disclose the missing transition on phones.
    const novgorodTarget = new URL(url);
    novgorodTarget.searchParams.set('year', '1479');
    novgorodTarget.searchParams.set('month', '1');
    const novgorodResponse = await page.goto(novgorodTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(novgorodResponse?.ok(), `mobile ${width}: 1479 HTTP ${novgorodResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1479-01')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1462-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Новгород (1478)')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('не подтверждено');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1479-01', null, {timeout: 15000});
    assert.equal(await page.locator('main aside p').getAttribute('data-history-geometry-gap'),
      'muscovy-1462-reused', `mobile ${width}: 1479 warning lost in 2D`);
    await page.getByRole('button', {name: 'Показать глобус'}).click();

    // The 1505 Muscovy contour is still reused for 1514: do not call it
    // geographically verified in either projection or on a phone.
    const staleTarget = new URL(url);
    staleTarget.searchParams.set('year', '1514');
    staleTarget.searchParams.set('month', '7');
    const staleResponse = await page.goto(staleTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(staleResponse?.ok(), `mobile ${width}: 1514 HTTP ${staleResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1514-07')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1505-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Псков (1510)')
        && !(p?.getAttribute('data-history-mobile-caption') || '').includes('Смоленск (1514)')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('не подтверждено');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1514-07', null, {timeout: 15000});
    assert.equal(await page.locator('main aside p').getAttribute('data-history-geometry-gap'),
      'muscovy-1505-reused', `mobile ${width}: stale border warning lost in 2D`);

    // The 1505 Moscow polygon also predates Ryazan's 1521 annexation.
    // This warning must survive both globe and flat-map rendering at 390/360px.
    const ryazanTarget = new URL(url);
    ryazanTarget.searchParams.set('year', '1522');
    ryazanTarget.searchParams.set('month', '1');
    const ryazanResponse = await page.goto(ryazanTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(ryazanResponse?.ok(), `mobile ${width}: 1522 HTTP ${ryazanResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1522-01')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1505-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Рязань (1521)')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('Рязань (1521)');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1522-01', null, {timeout: 15000});
    assert.match(await page.locator('main aside p').getAttribute('data-history-mobile-caption') || '',
      /Рязань \(1521\)/, `mobile ${width}: Ryazan warning lost in 2D`);
    await page.getByRole('button', {name: 'Показать глобус'}).click();

    assert.equal(errors.length, 0, `mobile ${width}: page errors ${errors.join('; ')}`);
    console.log(`Mobile territory ${width}px passed:`, JSON.stringify(metrics));
    await page.close();
  }
} finally {
  await browser.close();
}
