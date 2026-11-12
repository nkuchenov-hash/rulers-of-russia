import {chromium} from 'playwright';

const baseUrl = process.env.TERRITORY_SMOKE_URL ||
  'http://127.0.0.1:4173/rulers-of-russia/territory/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const checks = [];
try {
  for (const width of [1440, 390, 360]) {
    const page = await browser.newPage({viewport:{width,height:width===1440?900:780},deviceScaleFactor:1});
    const errors = [], geographyRequests = [];
    page.on('pageerror', e=>errors.push(String(e?.stack||e)));
    page.on('request', r=>{
      if (r.url().includes('/data/history-core/generated/provisional/')) geographyRequests.push(r.url());
    });
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('year','1556');
      url.searchParams.set('month','12');
      const response = await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:45000});
      if(!response?.ok())throw new Error('Globe HTTP error: '+response?.status());
      await page.waitForFunction(()=>{
        const aside=document.querySelector('main aside');
        const host=document.querySelector('main div[class*="globeHost"] canvas');
        return aside?.getAttribute('data-history-loaded-month')==='1556-12'
          && aside?.getAttribute('aria-busy')==='false'
          && aside.textContent?.includes('реконструкция')
          && aside.textContent?.includes('Историческая карта России')
          && (aside.textContent?.includes('не проверено независимо') || aside.textContent?.includes('независимая точность не подтверждена'))
          && host?.width>200 && host?.height>100
          && host.getBoundingClientRect().height>100;
      },null,{timeout:30000});
      const sourceLink=page.locator('main aside a[href="https://rusmap.org/data/"]');
      const source=await sourceLink.count();
      if(source!==1 || !await sourceLink.isVisible())
        throw new Error('Attribution must actually be visible at '+width+'px, count: '+source);
      if(!geographyRequests.some(u=>u.includes('/provisional/'))) {
        throw new Error('1556 globe never requested the chosen dated source geometry');
      }
      if(errors.length)throw new Error('1556 Chromium console errors: '+errors.join('; '));
      // Switching from the display candidate to the 2D analytical fallback and
      // back must not change the month or source attribution.
      await page.getByRole('button',{name:'Показать плоскую карту'}).click();
      await page.waitForFunction(()=>document.querySelector(
        'canvas[data-territory-flat-map="true"]'
      )?.dataset.historyMonth==='1556-12',null,{timeout:15000});
      await page.getByRole('button',{name:'Показать глобус'}).click();
      await page.waitForFunction(()=>{
        const host=document.querySelector('main div[class*="globeHost"] canvas');
        return host?.getBoundingClientRect().height>100
          && document.querySelector('main aside')?.getAttribute('data-history-loaded-month')==='1556-12';
      },null,{timeout:15000});
      checks.push({width,visibleMonth:'1556-12',creditedSource:true,sourceRequests:geographyRequests.length,projections:'3D -> 2D -> 3D'});
    } finally {
      await page.close();
    }
  }
  console.log('Dated Muscovy globe visual user scenarios passed:',JSON.stringify(checks));
} finally {
  await browser.close();
}