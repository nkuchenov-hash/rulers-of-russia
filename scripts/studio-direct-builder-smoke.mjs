import { chromium } from 'playwright';

const url = process.env.STUDIO_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/studio/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

const rect = async selector => page.locator(selector).first().evaluate(el => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});

async function dragLocator(locator, dx, dy) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Drag target has no bounding box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(220);
}

try {
  await page.addInitScript(() => window.localStorage.clear());
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || !response.ok()) throw new Error(`Studio HTTP failed: ${response?.status()}`);
  await page.waitForSelector('[data-studio-direct-frame="true"]', { timeout: 15000 });
  await page.waitForTimeout(250);

  const territory = page.locator('[data-module-id="territory"]');
  await territory.locator('h2').click();
  await page.waitForTimeout(120);

  const territoryBefore = await rect('[data-module-id="territory"]');
  const mapBefore = await rect('[data-module-id="map"]');
  const factsBefore = await rect('[data-module-id="facts"]');

  await dragLocator(page.locator('[data-studio-resize-handle="e"]'), 360, 0);

  const territoryAfter = await rect('[data-module-id="territory"]');
  const mapAfter = await rect('[data-module-id="map"]');
  const factsAfter = await rect('[data-module-id="facts"]');

  if (territoryAfter.width < territoryBefore.width + 320) {
    throw new Error(`Direct edge resize did not grow Territory enough: ${territoryBefore.width} -> ${territoryAfter.width}`);
  }

  const mapShrank = mapAfter.width < mapBefore.width - 40;
  const factsReflowed = factsAfter.top > factsBefore.top + 40;
  const mapReflowed = mapAfter.top > mapBefore.top + 40;
  if (!mapShrank && !factsReflowed && !mapReflowed) {
    throw new Error(`Adjacent layout did not react to large Territory resize: map ${mapBefore.width} -> ${mapAfter.width}, map top ${mapBefore.top} -> ${mapAfter.top}, facts top ${factsBefore.top} -> ${factsAfter.top}`);
  }

  const storedAfterResize = await page.evaluate(() => window.localStorage.getItem('rulers-of-russia:studio:element-layout:v1'));
  if (!storedAfterResize?.includes('module:territory') || !storedAfterResize.includes('"width"')) {
    throw new Error(`Direct resize was not persisted: ${storedAfterResize}`);
  }

  const cards = page.locator('[data-module-id="thematic-card"] > .thematic-card');
  if (await cards.count() < 2) throw new Error('Need at least two thematic cards for drag-reorder smoke');
  await cards.nth(0).click();
  await page.waitForTimeout(120);

  const secondBox = await cards.nth(1).boundingBox();
  const grip = page.locator('.studio-direct-grip');
  const gripBox = await grip.boundingBox();
  if (!secondBox || !gripBox) throw new Error('Missing drag geometry for thematic cards');

  const startX = gripBox.x + gripBox.width / 2;
  const startY = gripBox.y + gripBox.height / 2;
  const targetX = secondBox.x + secondBox.width * 0.78;
  const targetY = secondBox.y + secondBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(220);

  const orders = await page.locator('[data-module-id="thematic-card"] > .thematic-card').evaluateAll(nodes => nodes.slice(0, 2).map(node => Number(getComputedStyle(node).order)));
  if (!(orders[0] > orders[1])) {
    throw new Error(`Direct drag did not reorder first card after second: ${JSON.stringify(orders)}`);
  }

  const storedAfterDrag = await page.evaluate(() => window.localStorage.getItem('rulers-of-russia:studio:element-layout:v1'));
  if (!storedAfterDrag?.includes('"order"')) throw new Error(`Direct drag order was not persisted: ${storedAfterDrag}`);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('[data-studio-direct-frame="true"]', { timeout: 15000 });
  await page.waitForTimeout(300);

  const territoryReloaded = await rect('[data-module-id="territory"]');
  if (Math.abs(territoryReloaded.width - territoryAfter.width) > 4) {
    throw new Error(`Direct resize did not survive reload: ${territoryAfter.width} -> ${territoryReloaded.width}`);
  }

  const ordersReloaded = await page.locator('[data-module-id="thematic-card"] > .thematic-card').evaluateAll(nodes => nodes.slice(0, 2).map(node => Number(getComputedStyle(node).order)));
  if (!(ordersReloaded[0] > ordersReloaded[1])) {
    throw new Error(`Direct drag order did not survive reload: ${JSON.stringify(ordersReloaded)}`);
  }

  console.log('Studio direct page-builder smoke passed', JSON.stringify({
    territory: [territoryBefore.width, territoryAfter.width, territoryReloaded.width],
    map: [mapBefore.width, mapAfter.width],
    mapTop: [mapBefore.top, mapAfter.top],
    factsTop: [factsBefore.top, factsAfter.top],
    orders,
    ordersReloaded
  }));
} finally {
  await browser.close();
}
