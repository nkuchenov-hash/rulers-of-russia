import { chromium } from 'playwright';

const url = process.env.STUDIO_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/studio/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const rect = async selector => page.locator(selector).first().evaluate(el => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
});

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || !response.ok()) throw new Error(`Studio HTTP failed: ${response?.status()}`);
  await page.waitForSelector('.studio-element-controls-host', { timeout: 15000 });
  await page.waitForTimeout(250);

  const host = page.locator('.studio-element-controls-host');
  const numberInputs = host.locator('input[type="number"]');
  if (await numberInputs.count() < 5) {
    throw new Error(`Generic Studio controls missing; expected Width/Height/Order/Grow/Shrink, got ${await numberInputs.count()} numeric controls`);
  }
  const selects = host.locator('select');
  if (await selects.count() < 3) {
    throw new Error(`Generic Studio controls missing unit/alignment selectors, got ${await selects.count()}`);
  }

  const heroBefore = await rect('[data-module-id="hero"]');
  const tabsBefore = await rect('[data-module-id="page-tabs"]');
  const targetHeight = Math.round(heroBefore.height + 80);

  const heightInput = numberInputs.nth(1);
  await heightInput.focus();
  await heightInput.fill(String(targetHeight));
  await page.waitForTimeout(180);

  const heroAfter = await rect('[data-module-id="hero"]');
  const tabsAfter = await rect('[data-module-id="page-tabs"]');
  if (Math.abs(heroAfter.height - targetHeight) > 2) {
    throw new Error(`Studio Height override did not apply: expected ${targetHeight}px, got ${heroAfter.height}px`);
  }
  const expectedShift = heroAfter.height - heroBefore.height;
  const actualShift = tabsAfter.top - tabsBefore.top;
  if (Math.abs(actualShift - expectedShift) > 3) {
    throw new Error(`Studio auto-layout did not reflow after Hero resize: expected tab shift ${expectedShift}px, got ${actualShift}px`);
  }

  await host.getByRole('button', { name: 'Сбросить' }).click();
  await page.waitForTimeout(180);
  const heroReset = await rect('[data-module-id="hero"]');
  if (Math.abs(heroReset.height - heroBefore.height) > 3) {
    throw new Error(`Studio reset did not restore Hero: before ${heroBefore.height}px, reset ${heroReset.height}px`);
  }

  const storage = await page.evaluate(() => window.localStorage.getItem('rulers-of-russia:studio:element-layout:v1'));
  if (storage && storage.includes('module:hero')) {
    throw new Error(`Reset left stale Hero layout override in localStorage: ${storage}`);
  }

  console.log('Studio editor controls smoke passed', JSON.stringify({
    heroBefore: heroBefore.height,
    heroResized: heroAfter.height,
    heroReset: heroReset.height,
    tabsShift: actualShift
  }));
} finally {
  await browser.close();
}
