import { chromium } from 'playwright';

const url = process.env.STUDIO_SMOKE_URL || 'http://127.0.0.1:4173/rulers-of-russia/studio/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const pageErrors = [];
const consoleErrors = [];

page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
page.on('console', message => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const near = (value, min, max, label) => {
  if (value < min || value > max) throw new Error(`${label}: ${value}px, expected ${min}..${max}px`);
};
const atLeast = (value, min, label) => {
  if (value < min) throw new Error(`${label}: ${value}px, expected >= ${min}px`);
};

async function closeDesktopInspectorIfOpen() {
  const close = page.locator('.inspector-desktop-close');
  if (await close.count()) await close.first().click();
  await page.waitForTimeout(100);
}

async function desktopAudit() {
  const state = await page.evaluate(() => {
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    };
    const font = selector => {
      const el = document.querySelector(selector);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    };
    const cards = [...document.querySelectorAll('[data-module-id="thematic-card"] > .thematic-card')].map(el => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), width: r.width, height: r.height };
    });
    const rowCounts = Object.values(cards.reduce((acc, card) => {
      acc[card.top] = (acc[card.top] || 0) + 1;
      return acc;
    }, {}));
    const surface = document.querySelector('.core-site-surface');
    return {
      surface: rect('.core-site-surface'),
      rail: rect('[data-module-id="historical-rail"]'),
      hero: rect('[data-module-id="hero"]'),
      tabs: rect('[data-module-id="page-tabs"]'),
      primary: rect('.primary-content-row'),
      territory: rect('[data-module-id="territory"]'),
      map: rect('[data-module-id="map"]'),
      facts: rect('[data-module-id="facts"]'),
      events: rect('[data-module-id="thematic-card"]'),
      timeline: rect('[data-module-id="reign-timeline"]'),
      cards,
      rowCounts,
      overflow: surface ? surface.scrollWidth - surface.clientWidth : 9999,
      fonts: {
        nav: font('.core-main-nav button'),
        railName: font('.rail-item strong'),
        railYears: font('.rail-item span'),
        heroSummary: font('[data-element-id="hero-summary"]'),
        heroMetaLabel: font('.hero-meta small'),
        heroMetaValue: font('.hero-meta strong'),
        tab: font('[data-element-id="page-tab"]'),
        legend: font('[data-element-id="territory-legend-item"]'),
        fact: font('.fact-row label'),
        eventTitle: font('.thematic-card h2'),
        eventText: font('.thematic-card p'),
        timeline: font('.timeline-events span')
      }
    };
  });

  if (!state.surface || !state.rail || !state.hero || !state.tabs || !state.primary || !state.events || !state.timeline) {
    throw new Error(`Studio modules missing: ${JSON.stringify(state)}`);
  }

  near(state.surface.width, 1500, 1601, 'desktop canvas width');
  near(state.rail.width, 240, 280, 'desktop rail width');
  atLeast(state.hero.height, 355, 'hero height');
  atLeast(state.tabs.height, 50, 'tabs height');
  atLeast(state.map?.width || 0, 500, 'map width');
  atLeast(state.facts?.width || 0, 320, 'comparison width');
  atLeast(state.territory?.width || 0, 190, 'map controls width');

  if (state.hero.bottom > state.tabs.top + 2) throw new Error('Hero overlaps page tabs');
  if (state.tabs.bottom > state.primary.top + 2) throw new Error('Page tabs overlap dashboard');
  if (state.primary.bottom > state.events.top + 2) throw new Error('Dashboard overlaps events');
  if (state.events.bottom > state.timeline.top + 2) throw new Error('Events overlap timeline');
  if (state.overflow > 2) throw new Error(`Studio canvas horizontal overflow: ${state.overflow}px`);
  if (Math.abs(state.timeline.width - state.surface.width) > 2) {
    throw new Error(`Timeline width ${state.timeline.width}px does not match canvas ${state.surface.width}px`);
  }
  if (Math.abs(state.timeline.left - state.surface.left) > 2 || Math.abs(state.timeline.right - state.surface.right) > 2) {
    throw new Error(`Timeline must align to canvas edges: timeline ${state.timeline.left}..${state.timeline.right}, canvas ${state.surface.left}..${state.surface.right}`);
  }

  if (state.cards.length !== 7) throw new Error(`Expected 7 Studio event cards, got ${state.cards.length}`);
  if (state.rowCounts.length !== 2 || state.rowCounts[0] !== 4 || state.rowCounts[1] !== 3) {
    throw new Error(`Desktop event grid must be 4+3, got ${JSON.stringify(state.rowCounts)}`);
  }

  atLeast(state.fonts.nav, 18, 'global nav font');
  atLeast(state.fonts.railName, 18, 'rail name font');
  atLeast(state.fonts.railYears, 18, 'rail years font');
  atLeast(state.fonts.heroSummary, 20, 'hero summary font');
  atLeast(state.fonts.heroMetaLabel, 18, 'hero meta label font');
  atLeast(state.fonts.heroMetaValue, 20, 'hero meta value font');
  atLeast(state.fonts.tab, 18, 'page tab font');
  atLeast(state.fonts.legend, 18, 'territory legend font');
  atLeast(state.fonts.fact, 18, 'comparison font');
  atLeast(state.fonts.eventTitle, 22, 'event title font');
  atLeast(state.fonts.eventText, 18, 'event body font');
  atLeast(state.fonts.timeline, 18, 'timeline font');

  await page.screenshot({ path: 'studio-smoke-desktop.png', fullPage: true });
  return state;
}

async function mobileAudit() {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('.core-site-surface', { timeout: 15000 });
  await page.waitForTimeout(250);

  const state = await page.evaluate(() => {
    const font = selector => {
      const el = document.querySelector(selector);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    };
    const rect = selector => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, top: r.top, bottom: r.bottom };
    };
    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      hero: rect('[data-module-id="hero"]'),
      cards: [...document.querySelectorAll('[data-module-id="thematic-card"] > .thematic-card')].length,
      fonts: {
        railName: font('.rail-item strong'),
        railYears: font('.rail-item span'),
        heroSummary: font('[data-element-id="hero-summary"]'),
        heroMeta: font('.hero-meta strong'),
        tab: font('[data-element-id="page-tab"]'),
        legend: font('[data-element-id="territory-legend-item"]'),
        fact: font('.fact-row label'),
        eventTitle: font('.thematic-card h2'),
        eventText: font('.thematic-card p'),
        timeline: font('.timeline-events span')
      }
    };
  });

  if (state.documentOverflow > 2) throw new Error(`Mobile document horizontal overflow: ${state.documentOverflow}px`);
  atLeast(state.hero?.height || 0, 780, 'mobile hero height');
  if (state.cards !== 7) throw new Error(`Expected 7 mobile event cards, got ${state.cards}`);

  atLeast(state.fonts.railName, 18, 'mobile rail name font');
  atLeast(state.fonts.railYears, 18, 'mobile rail years font');
  atLeast(state.fonts.heroSummary, 20, 'mobile hero summary font');
  atLeast(state.fonts.heroMeta, 20, 'mobile hero meta font');
  atLeast(state.fonts.tab, 18, 'mobile page tab font');
  atLeast(state.fonts.legend, 20, 'mobile legend font');
  atLeast(state.fonts.fact, 20, 'mobile comparison font');
  atLeast(state.fonts.eventTitle, 24, 'mobile event title font');
  atLeast(state.fonts.eventText, 18, 'mobile event body font');
  atLeast(state.fonts.timeline, 18, 'mobile timeline font');

  await page.screenshot({ path: 'studio-smoke-mobile.png', fullPage: true });
  return state;
}

try {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!response || !response.ok()) throw new Error(`Studio HTTP failed: ${response?.status()}`);
  await page.waitForSelector('.core-site-surface', { timeout: 15000 });
  await page.waitForTimeout(250);
  await closeDesktopInspectorIfOpen();

  const desktop = await desktopAudit();
  const mobile = await mobileAudit();

  if (pageErrors.length) throw new Error(`Studio browser page errors:\n${pageErrors.join('\n---\n')}`);
  const fatalConsole = consoleErrors.filter(x => /ReferenceError|TypeError|SyntaxError|Uncaught|out of memory/i.test(x));
  if (fatalConsole.length) throw new Error(`Studio fatal console errors:\n${fatalConsole.join('\n---\n')}`);

  console.log('Studio commercial browser smoke passed');
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
} finally {
  await browser.close();
}
