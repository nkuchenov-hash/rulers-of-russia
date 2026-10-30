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
    // A visible projection toggle does not prove that the mobile WebGL
    // renderer produced a frame. The flat map can work while 3D is blank.
    const globeCanvas = page.locator('canvas[data-territory-globe="true"]');
    const globeRenderCount = async () => Number(
      await globeCanvas.getAttribute('data-territory-render-count') || 0
    );
    const waitForRenderedGlobe = async (stage, previousRenderCount = 0) => {
      try {
        await page.waitForFunction(({previousRenderCount, viewportWidth}) => {
          const canvas = document.querySelector('canvas[data-territory-globe="true"]');
          if (!canvas || !canvas.isConnected) return false;
          const rect = canvas.getBoundingClientRect();
          const style = getComputedStyle(canvas);
          // A render counter can advance even after the WebGL context is lost.
          const gl = canvas.getContext('webgl2');
          return Boolean(gl && !gl.isContextLost())
            && canvas.width > 300 && canvas.height > 200
            && rect.width >= viewportWidth * 0.75 && rect.height > 150
            && rect.right > 0 && rect.left < viewportWidth
            && style.display !== 'none' && style.visibility === 'visible'
            && Number(canvas.dataset.territoryRenderCount || 0) > previousRenderCount;
        }, {previousRenderCount, viewportWidth: width}, {polling: 100, timeout: 15000});
      } catch (error) {
        throw new Error(`mobile ${width}: globe failed to render at ${stage} (previous render count ${previousRenderCount})`, {cause: error});
      }
    };
    const returnToGlobe = async stage => {
      const previousRenderCount = await globeRenderCount();
      await page.getByRole('button', {name: 'Показать глобус'}).click();
      await waitForRenderedGlobe(stage, previousRenderCount);
    };
    // A visible, correctly dated 2D canvas may still contain only a blank
    // backing store. Sample actual painted pixels without storing screenshots
    // or relying on one color that could change with the map theme.
    const waitForPaintedFlatMap = async (month, stage) => {
      try {
        await page.waitForFunction(expectedMonth => {
          const canvas = document.querySelector('canvas[data-territory-flat-map="true"]');
          if (!canvas || canvas.dataset.historyMonth !== expectedMonth) return false;
          const context = canvas.getContext('2d');
          if (!context || canvas.width < 300 || canvas.height < 100) return false;
          const colors = new Set();
          for (let y = 1; y <= 9; y += 1) {
            for (let x = 1; x <= 9; x += 1) {
              const pixel = context.getImageData(
                Math.floor(canvas.width * x / 10),
                Math.floor(canvas.height * y / 10), 1, 1
              ).data;
              if (pixel[3] > 200) colors.add(`${pixel[0]},${pixel[1]},${pixel[2]}`);
            }
          }
          return colors.size >= 3;
        }, month, {polling: 200, timeout: 15000});
      } catch (error) {
        throw new Error(`mobile ${width}: flat map has no varied painted pixels at ${stage} (${month})`, {cause: error});
      }
    };
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

    await waitForRenderedGlobe('initial 1581-07');

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
    await waitForPaintedFlatMap('1581-07', 'initial 2D switch');
    const mapBounds = await flat.boundingBox();
    assert(mapBounds && mapBounds.width >= width - 1,
      `mobile ${width}: flat map fails to fill the viewport: ${JSON.stringify(mapBounds)}`);
    assert(await page.getByRole('button', {name: 'Показать глобус'}).isVisible(),
      `mobile ${width}: cannot switch back to globe`);

    // Real Chromium multi-touch input, not synthetic DOM pointer events:
    // verify both directions of 2D pinch zoom on 390px and 360px screens.
    // The old flat map replaced the first finger with the second and never
    // changed zoom, even though its single-finger drag and zoom buttons worked.
    const touch = await page.context().newCDPSession(page);
    const cx = mapBounds.x + mapBounds.width / 2;
    const cy = mapBounds.y + mapBounds.height / 2;
    const points = separation => [
      {x: cx - separation, y: cy, id: 1},
      {x: cx + separation, y: cy, id: 2},
    ];
    const zoomValue = async () => Number(await flat.getAttribute('data-camera-zoom'));
    const zoomBeforePinch = await zoomValue();
    await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: points(35)});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: points(80)});
    await page.waitForFunction(before => Number(
      document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraZoom
    ) > before * 1.3, zoomBeforePinch, {timeout: 8000});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    const zoomAfterOutwardPinch = await zoomValue();
    await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: points(80)});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: points(35)});
    await page.waitForFunction(before => Number(
      document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraZoom
    ) < before * .8, zoomAfterOutwardPinch, {timeout: 8000});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await touch.detach();
    await waitForPaintedFlatMap('1581-07', 'after mobile two-finger pinch');

    const month = page.getByLabel('Месяц');
    await month.selectOption('8');
    await page.waitForFunction(() => (document.body?.innerText || '').includes('History Core 1581-08'), null, {timeout: 30000});
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1581-08', null, {timeout: 12000});
    await returnToGlobe('1581-08');
    // The 1462 contour is reused across the 1478 annexation of Novgorod.
    // Both projections must disclose the missing transition on phones.
    const novgorodTarget = new URL(url);
    novgorodTarget.searchParams.set('year', '1478');
    novgorodTarget.searchParams.set('month', '1');
    const novgorodResponse = await page.goto(novgorodTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(novgorodResponse?.ok(), `mobile ${width}: 1478 HTTP ${novgorodResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1478-01')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1462-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Новгород (1478)')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('не подтверждено');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1478-01', null, {timeout: 15000});
    assert.equal(await page.locator('main aside p').getAttribute('data-history-geometry-gap'),
      'muscovy-1462-reused', `mobile ${width}: 1478 warning lost in 2D`);
    await returnToGlobe('1478-01');

    // A 1490 month still reuses the 1462 Moscow contour despite the
    // separately dated Rostov, Novgorod, Tver and Vyatka acquisitions.
    // Check the complete mobile disclosure and its layout in BOTH projections.
    const annexationsTarget = new URL(url);
    annexationsTarget.searchParams.set('year', '1490');
    annexationsTarget.searchParams.set('month', '1');
    const annexationsResponse = await page.goto(annexationsTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(annexationsResponse?.ok(), `mobile ${width}: 1490 HTTP ${annexationsResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      const caption = p?.getAttribute('data-history-mobile-caption') || '';
      return (document.body?.innerText || '').includes('History Core 1490-01')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1462-reused'
        && ['Ростов (1474)', 'Новгород (1478)', 'Тверь (1485)', 'Вятка (1489)']
          .every(label => caption.includes(label));
    }, null, {timeout: 45000});
    const annexationLayout = await page.evaluate(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      const zoom = document.querySelector('main div[class*="zoomTools"]');
      return {
        documentWidth: document.documentElement.scrollWidth,
        statusRight: p?.getBoundingClientRect().right,
        zoomLeft: zoom?.getBoundingClientRect().left,
        textSize: parseFloat(getComputedStyle(p, '::after').fontSize),
      };
    });
    assert(annexationLayout.documentWidth <= width + 1 && annexationLayout.statusRight < annexationLayout.zoomLeft
      && annexationLayout.textSize >= 16,
    `mobile ${width}: multi-transition caption layout regression: ${JSON.stringify(annexationLayout)}`);
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1490-01',
      null, {timeout: 15000});
    assert.match(await page.locator('main aside p').getAttribute('data-history-mobile-caption') || '',
      /Тверь \(1485\).*Вятка \(1489\)/, `mobile ${width}: 1490 warning lost in 2D`);
    await returnToGlobe('1490-01');

    // The pinned 1400 world snapshot has no separately named independent
    // Tver. This is a real source-coverage gap, not a missing History Core
    // geometry file. Disclose it on both 2D and 3D at phone widths.
    const tverGapTarget = new URL(url);
    tverGapTarget.searchParams.set('year', '1400');
    tverGapTarget.searchParams.set('month', '7');
    const tverGapResponse = await page.goto(tverGapTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(tverGapResponse?.ok(), `mobile ${width}: 1400 HTTP ${tverGapResponse?.status()}`);
    const visibleTverSourceWarning = () => page.waitForFunction(() => {
      const note = document.querySelector('main aside [role="note"]');
      if (!note?.textContent?.includes('Тверское княжество не выделено')) return false;
      const box = note.getBoundingClientRect();
      const style = getComputedStyle(note);
      return box.width > 0 && box.height > 0 && style.display !== 'none'
        && style.visibility === 'visible' && parseFloat(style.fontSize) >= 16;
    }, null, {timeout: 45000});
    await visibleTverSourceWarning();
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() =>
      document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1400-07',
      null, {timeout: 15000});
    await visibleTverSourceWarning();
    const sourceWarningBounds = await page.evaluate(() => {
      const note = document.querySelector('main aside [role="note"]');
      const zoom = document.querySelector('main div[class*="zoomTools"]');
      return {
        right: note?.getBoundingClientRect().right,
        zoomLeft: zoom?.getBoundingClientRect().left,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    assert(sourceWarningBounds.documentWidth <= width + 1
      && sourceWarningBounds.right < sourceWarningBounds.zoomLeft,
      `mobile ${width}: source warning overlaps zoom or overflows: ${JSON.stringify(sourceWarningBounds)}`);
    await returnToGlobe('1400-07');
    await visibleTverSourceWarning();


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

    // Smolensk fell in July 1514 Julian / August 1514 Gregorian. The
    // August month-end view must disclose the missing acquisition in 2D/3D.
    const smolenskTarget = new URL(url);
    smolenskTarget.searchParams.set('year', '1514');
    smolenskTarget.searchParams.set('month', '8');
    const smolenskResponse = await page.goto(smolenskTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(smolenskResponse?.ok(), `mobile ${width}: 1514-08 HTTP ${smolenskResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1514-08')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1505-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Смоленск (1514)');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1514-08', null, {timeout: 15000});
    assert.match(await page.locator('main aside p').getAttribute('data-history-mobile-caption') || '',
      /Смоленск \(1514\)/, `mobile ${width}: Smolensk warning lost in 2D`);
    await returnToGlobe('1514-08');

    // The unchanged 1505 polygon misses Ryazan's documented Moscow control by autumn 1521.
    // The conservative September month-end warning must survive 3D/2D at 390/360px.
    const ryazanTarget = new URL(url);
    ryazanTarget.searchParams.set('year', '1521');
    ryazanTarget.searchParams.set('month', '9');
    const ryazanResponse = await page.goto(ryazanTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(ryazanResponse?.ok(), `mobile ${width}: 1521 HTTP ${ryazanResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 1521-09')
        && p?.getAttribute('data-history-geometry-gap') === 'muscovy-1505-reused'
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('Рязань (1521)')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('Рязань (1521)');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() => document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '1521-09', null, {timeout: 15000});
    assert.match(await page.locator('main aside p').getAttribute('data-history-mobile-caption') || '',
      /Рязань \(1521\)/, `mobile ${width}: Ryazan warning lost in 2D`);
    await returnToGlobe('1521-09');

    // A source-backed internal History Core state must never be presented
    // as independently geographically accepted, including on narrow phones
    // and after switching projection.
    const verifiedTarget = new URL(url);
    verifiedTarget.searchParams.set('year', '2026');
    verifiedTarget.searchParams.set('month', '2');
    const verifiedResponse = await page.goto(verifiedTarget.href, {waitUntil: 'domcontentloaded', timeout: 45000});
    assert(verifiedResponse?.ok(), `mobile ${width}: 2026 HTTP ${verifiedResponse?.status()}`);
    await page.waitForFunction(() => {
      const p = document.querySelector('main aside p[data-history-accuracy-caption]');
      return (document.body?.innerText || '').includes('History Core 2026-02')
        && (p?.getAttribute('data-history-mobile-caption') || '').includes('независимая точность не подтверждена')
        && (p?.getAttribute('data-history-accuracy-caption') || '').includes('внутренний аудит');
    }, null, {timeout: 45000});
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await page.waitForFunction(() =>
      document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.historyMonth === '2026-02',
      null, {timeout: 15000});
    assert.match(await page.locator('main aside p').getAttribute('data-history-mobile-caption') || '',
      /независимая точность не подтверждена/,
      `mobile ${width}: independent-accuracy warning lost in 2D`);
    await waitForPaintedFlatMap('2026-02', 'modern 2D switch');

    await returnToGlobe('2026-02');
    assert.equal(errors.length, 0, `mobile ${width}: page errors ${errors.join('; ')}`);
    console.log(`Mobile territory ${width}px passed:`, JSON.stringify(metrics));
    await page.close();
  }
} finally {
  await browser.close();
}
