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

// Require the actual visible WebGL surface, not an arbitrary canvas that
// might belong to the flat view during the projection transition.
// The globe remains mounted while the flat view is shown. Verify a fresh
// renderer.render call after returning, not merely the existence of a canvas.
// Interval polling avoids RAF-dependent Playwright checks stalling during
// projection transitions while preserving the original 8-second deadline.
const globeRenderCount = async () => Number(
  await page.locator('canvas[data-territory-globe="true"]').getAttribute('data-territory-render-count') || 0
);
const waitForGlobeCanvas = async (stage, minRenderCount = 0) => {
  try {
    await page.waitForFunction(previousRenderCount => {
      const canvas = document.querySelector('canvas[data-territory-globe="true"]');
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return canvas.isConnected && canvas.width > 300 && canvas.height > 200
        && rect.width > 300 && rect.height > 200
        && style.visibility === 'visible' && style.display !== 'none'
        && Number(canvas.dataset.territoryRenderCount || 0) > previousRenderCount;
    }, minRenderCount, {polling: 100, timeout: 8000});
  } catch (error) {
    const canvases = await page.evaluate(() => [...document.querySelectorAll('canvas')].map(canvas => {
      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      const gl = canvas.dataset.territoryGlobe === 'true' ? canvas.getContext('webgl2') : null;
      return {
        globe: canvas.dataset.territoryGlobe === 'true',
        flat: canvas.dataset.territoryFlatMap === 'true',
        connected: canvas.isConnected,
        buffer: [canvas.width, canvas.height],
        rect: [Math.round(rect.width), Math.round(rect.height)],
        display: style.display,
        visibility: style.visibility,
        hostVisibility: canvas.parentElement ? getComputedStyle(canvas.parentElement).visibility : null,
        contextLost: gl ? gl.isContextLost() : null,
        renderCount: canvas.dataset.territoryRenderCount || null
      };
    })).catch(e => ({diagnosticError: String(e)}));
    throw new Error(`Globe canvas not ready at ${stage}: ${JSON.stringify(canvases)}`, {cause: error});
  }
};

const waitForHistoryStateStatus = async () => {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || '';
    return text.includes('геометрия прошла внутренний аудит; независимая точность не подтверждена') || text.includes('реконструкция · достоверность');
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
  await waitForGlobeCanvas('initial load');
  await page.waitForFunction(visibleCountryLabel, null, { timeout: 5000 });
  await page.waitForFunction(() => document.body?.innerText?.includes('History Core'), null, { timeout: 8000 });
  await waitForHistoryStateStatus();
  await waitForCurrentVerifiedTracks();
  // A History Core geometry-verified state has passed the internal source
  // audit, not the independent Runivers geographic comparison. Both the
  // desktop and mobile caption must disclose that distinction.
  await page.waitForFunction(() => {
    const p = document.querySelector('main aside p');
    return p?.getAttribute('data-history-accuracy-caption')?.includes('независимая точность не подтверждена')
      && p?.getAttribute('data-history-mobile-caption')?.includes('независимая точность не подтверждена');
  }, null, {timeout: 8000});
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
  // Camera-only redraws must not write canvas.width/height: assigning even
  // the same bitmap size clears and reallocates the entire 2D backing store.
  // Observe the real canvas after initial layout has settled.
  await flatCanvas.evaluate(canvas => {
    window.__flatBitmapSizeWrites = 0;
    window.__flatBitmapSizeObserver = new MutationObserver(mutations => {
      window.__flatBitmapSizeWrites += mutations.length;
    });
    window.__flatBitmapSizeObserver.observe(canvas, {
      attributes: true, attributeFilter: ['width', 'height']
    });
  });
  await page.getByRole('button', {name: '+', exact: true}).click();
  await page.waitForFunction(oldZoom => {
    const canvas = document.querySelector('canvas[data-territory-flat-map="true"]');
    return Number(canvas?.dataset.cameraZoom) > oldZoom;
  }, zoomBefore, {timeout: 8000});
  // The zoom state update must also have had time to redraw.
  await page.waitForTimeout(200);
  const bitmapWrites = await page.evaluate(() => {
    window.__flatBitmapSizeObserver?.disconnect();
    return window.__flatBitmapSizeWrites;
  });
  if (bitmapWrites !== 0) {
    throw new Error(`Flat map reallocated its canvas bitmap ${bitmapWrites} times on a zoom-only redraw`);
  }

  // Wheel zoom must keep the geographical point under the actual mouse
  // cursor fixed. Merely changing zoom around the canvas center makes users
  // lose their location when inspecting small historical enclaves.
  const wheelBefore = await flatCanvas.evaluate(canvas => {
    const rect = canvas.parentElement.getBoundingClientRect();
    return {zoom:Number(canvas.dataset.cameraZoom), dx:Number(canvas.dataset.cameraDx),
      dy:Number(canvas.dataset.cameraDy),
      x:rect.left+rect.width*.23, y:rect.top+rect.height*.33,
      anchorX:rect.width*(.23-.5), anchorY:rect.height*(.33-.5)};
  });
  await page.mouse.move(wheelBefore.x, wheelBefore.y);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(oldZoom =>
    Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraZoom) > oldZoom,
  wheelBefore.zoom, {timeout: 8000});
  const wheelAfter = await flatCanvas.evaluate(canvas => ({
    zoom:Number(canvas.dataset.cameraZoom), dx:Number(canvas.dataset.cameraDx),
    dy:Number(canvas.dataset.cameraDy)
  }));
  const ratio = wheelAfter.zoom / wheelBefore.zoom;
  const expectedDx = wheelBefore.dx + (1-ratio)*(wheelBefore.anchorX-wheelBefore.dx);
  const expectedDy = wheelBefore.dy + (1-ratio)*(wheelBefore.anchorY-wheelBefore.dy);
  if (Math.abs(wheelAfter.dx-expectedDx) > .3 || Math.abs(wheelAfter.dy-expectedDy) > .3) {
    throw new Error(`Flat wheel zoom moved cursor anchor: ${JSON.stringify({wheelBefore,wheelAfter,expectedDx,expectedDy})}`);
  }
  // React's passive onWheel handler can change camera zoom yet still let the
  // browser scroll the surrounding page. Require real DOM cancelation for
  // both zoom-wheel and horizontal trackpad gestures over the 2D canvas.
  const wheelCancellation = await flatCanvas.evaluate(canvas => {
    const rect = canvas.getBoundingClientRect();
    const dispatch = (deltaX, deltaY) => {
      const event = new WheelEvent('wheel', {
        bubbles:true, cancelable:true, deltaX, deltaY,
        clientX:rect.left+rect.width*.23, clientY:rect.top+rect.height*.33
      });
      const allowed = canvas.dispatchEvent(event);
      return {allowed, prevented:event.defaultPrevented};
    };
    return [dispatch(0,-60), dispatch(60,0)];
  });
  if (wheelCancellation.some(({allowed,prevented}) => allowed || !prevented)) {
    throw new Error('Flat map wheel gestures were not canceled; the page may scroll during map navigation: '+JSON.stringify(wheelCancellation));
  }

  // The flat map must remain operable for keyboard-only users. Key presses
  // must move the camera (not the timeline or document), and zoom around the
  // center with the same bounds as wheel and touch.
  const flatHost = page.locator('.territory-flat-host');
  if (await flatHost.getAttribute('tabindex') !== '0') {
    throw new Error('Flat map host is not keyboard focusable');
  }
  await flatHost.focus();
  const keyboardBefore = await flatCanvas.evaluate(canvas => ({
    dx:Number(canvas.dataset.cameraDx),dy:Number(canvas.dataset.cameraDy),
    zoom:Number(canvas.dataset.cameraZoom)
  }));
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(previous =>
    Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraDx) < previous-47,
  keyboardBefore.dx,{timeout:8000});
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(previous =>
    Math.abs(Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraDx)-previous)<.3,
  keyboardBefore.dx,{timeout:8000});
  await page.keyboard.press('Shift+ArrowUp');
  await page.waitForFunction(previous =>
    Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraDy)>previous+119,
  keyboardBefore.dy,{timeout:8000});
  const keyboardZoomBefore = Number(await flatCanvas.getAttribute('data-camera-zoom'));
  await page.keyboard.press('Equal');
  await page.waitForFunction(previous =>
    Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraZoom)>previous,
  keyboardZoomBefore,{timeout:8000});
  const keyboardZoomIn = Number(await flatCanvas.getAttribute('data-camera-zoom'));
  await page.keyboard.press('Minus');
  await page.waitForFunction(previous =>
    Number(document.querySelector('canvas[data-territory-flat-map="true"]')?.dataset.cameraZoom)<previous,
  keyboardZoomIn,{timeout:8000});

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
  const beforeFirstGlobeReturn = await globeRenderCount();
  await page.getByRole('button', {name: 'Показать глобус'}).click();
  if (await flatCanvas.count()) throw new Error('Planar canvas persisted after switching to globe');
  await waitForGlobeCanvas('first 2D to 3D return', beforeFirstGlobeReturn);

  // Exercise the same visibility-only transition repeatedly: the WebGL
  // surface must remain attached, visible, and correctly sized each time.
  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.getByRole('button', {name: 'Показать плоскую карту'}).click();
    await flatCanvas.waitFor({state: 'visible', timeout: 10000});
    const beforeGlobeReturn = await globeRenderCount();
    await page.getByRole('button', {name: 'Показать глобус'}).click();
    if (await flatCanvas.count()) throw new Error(`Planar canvas persisted after cycle ${cycle}`);
    await waitForGlobeCanvas(`repeat 2D to 3D cycle ${cycle}`, beforeGlobeReturn);
  }

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

  // Impossible deep links must never silently render the 862 or 2026 map.
  for (const badQuery of ['?year=1', '?year=1721&month=13', '?year=1510&year=1514']) {
    const badPage = await browser.newPage({viewport: {width: 390, height: 844}});
    try {
      const badUrl = new URL(url);
      badUrl.search = badQuery;
      const response = await badPage.goto(badUrl.href, {waitUntil: 'domcontentloaded', timeout: 45000});
      if (!response?.ok()) throw new Error('Invalid date route returned HTTP ' + response?.status());
      await badPage.getByRole('alert').getByText('Некорректная дата карты').waitFor({timeout: 10000});
      if (await badPage.locator('canvas').count()) {
        throw new Error('Invalid date ' + badQuery + ' incorrectly mounted a historical map');
      }
    } finally {
      await badPage.close();
    }
  }

  console.log('Territory browser smoke passed:', JSON.stringify(state));
} catch (error) {
  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 1600) || '').catch(() => '');
  console.error('Territory smoke diagnostics:', JSON.stringify({ pageErrors, consoleErrors, historyRequests, bodyText }, null, 2));
  throw error;
} finally {
  await browser.close();
}
