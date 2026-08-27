import fs from 'node:fs';

const rendererFile = 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx';
const cssFile = 'src/app/territory/territory-webgl.module.css';
const smokeFile = 'scripts/territory-browser-smoke.mjs';

const replaceOnce = (source, needle, replacement, label) => {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(needle, replacement);
};

let renderer = fs.readFileSync(rendererFile, 'utf8');

renderer = replaceOnce(
  renderer,
  "const YEAR_PX=6;",
  "const YEAR_PX=6;\nconst MONTH_LABELS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];",
  'month labels'
);

const loaderPattern = /function useHistoricalData\(year,polityId\)\{.*?\}\n\nexport function HistoricalTerritoryGlobeWebGLV21\(\{initialYear=TERRITORY_MAX_YEAR\}\)\{/s;
if (!loaderPattern.test(renderer)) throw new Error('History loader/export signature block not found');
renderer = renderer.replace(loaderPattern, `function historyMonthKey(year,month){return \`${'${String(year).padStart(4,\'0\')}-${String(month).padStart(2,\'0\')}'}\`}
function monthStateAt(index,year,month){if(!index?.months?.length)return null;const key=historyMonthKey(year,month),min=index.minMonth;if(/^\\d{4}-\\d{2}$/.test(min??'')){const minYear=Number(min.slice(0,4)),minMonth=Number(min.slice(5,7)),offset=(year-minYear)*12+(month-minMonth),item=index.months[offset];if(item?.month===key)return item}return index.months.find(item=>item.month===key)??null}
function useHistoricalData(year,month,polityId){const[index,setIndex]=useState(null),[manifest,setManifest]=useState(null),[monthIndex,setMonthIndex]=useState(null),[historyState,setHistoryState]=useState(null),[world,setWorld]=useState(null),[worldYear,setWorldYear]=useState(null),[russia,setRussia]=useState(null),[rivers,setRivers]=useState(null);const wc=useRef(new Map),rc=useRef(new Map),worldFileRef=useRef(null);useEffect(()=>{const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();Promise.all([fetch(\`${'${base}'}/data/territory/world-history/index.json\`,{signal:c.signal}).then(r=>r.json()),fetch(\`${'${base}'}/data/territory/archive/manifest.json\`,{signal:c.signal}).then(r=>r.json()),fetch(\`${'${base}'}/data/history-core/generated/month-index.json\`,{signal:c.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null).catch(()=>null),fetch(\`${'${base}'}/data/territory/hydro/rivers_50m.geojson\`,{signal:c.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([a,b,h,rv])=>{if(!c.signal.aborted){setIndex(a);setManifest(b);setMonthIndex(h);setRivers(rv)}}).catch(()=>{});return()=>c.abort()},[]);useEffect(()=>{const snap=snapshotAt(index,year);if(!snap||worldFileRef.current===snap.file)return;worldFileRef.current=snap.file;const cached=wc.current.get(snap.file);if(cached){setWorld(cached);setWorldYear(snap.year);return}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();fetch(\`${'${base}'}/data/territory/world-history/${'${snap.file}'}\`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{wc.current.set(snap.file,d);if(!c.signal.aborted){setWorld(d);setWorldYear(snap.year)}}).catch(()=>{if(worldFileRef.current===snap.file)worldFileRef.current=null});return()=>c.abort()},[index,year]);useEffect(()=>{const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController(),state=monthStateAt(monthIndex,year,month);const loadArchive=()=>{const e=manifest?.polities?.find(p=>p.polity_id===polityId&&p.file&&p.features>0);if(!e?.file){if(!c.signal.aborted){setRussia(null);setHistoryState(null)}return}const key=\`archive:${'${e.file}'}\`,cached=rc.current.get(key);if(cached){if(!c.signal.aborted){setRussia(cached);setHistoryState(null)}return}fetch(\`${'${base}'}/data/territory/archive/${'${e.file}'}\`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{rc.current.set(key,d);if(!c.signal.aborted){setRussia(d);setHistoryState(null)}}).catch(()=>{})};if(state?.geometryFile){const file=String(state.geometryFile).replace(/^\\/+/,''),key=\`history:${'${file}'}\`,cached=rc.current.get(key);if(cached){setRussia(cached);setHistoryState(state);return()=>c.abort()}fetch(\`${'${base}'}/${'${file}'}\`,{signal:c.signal,cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error(\`History Core geometry HTTP ${'${r.status}'}\`);return r.json()}).then(normalizeCollection).then(d=>{rc.current.set(key,d);if(!c.signal.aborted){setRussia(d);setHistoryState(state)}}).catch(()=>{if(!c.signal.aborted)loadArchive()})}else loadArchive();return()=>c.abort()},[monthIndex,manifest,polityId,year,month]);return{index,monthIndex,historyState,world,worldYear,russia,rivers}}

export function HistoricalTerritoryGlobeWebGLV21({initialYear=TERRITORY_MAX_YEAR,initialMonth=null}){`);

renderer = replaceOnce(
  renderer,
  "  const[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[mode,setMode]=useState('relief'),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);\n  const period=territoryPeriodAt(year),{index,world,worldYear,russia,rivers}=useHistoricalData(year,period.polityId),russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]),russiaKey=useMemo(()=>featureSetKey(russiaFeatures),[russiaFeatures]);",
  "  const defaultMonth=clamp(Number(initialMonth??(initialYear===new Date().getFullYear()?new Date().getMonth()+1:1)),1,12);\n  const[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[month,setMonth]=useState(defaultMonth),[mode,setMode]=useState('relief'),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);\n  const period=territoryPeriodAt(year),{index,historyState,world,worldYear,russia,rivers}=useHistoricalData(year,month,period.polityId),russiaFeatures=useMemo(()=>historyState?(russia?.features??[]):selectRussia(russia,year),[russia,year,historyState]),russiaKey=useMemo(()=>featureSetKey(russiaFeatures),[russiaFeatures]);",
  'component date state'
);

renderer = replaceOnce(
  renderer,
  "  function onEraJump(e){const next=Number(e.target.value);if(Number.isFinite(next))scrollToYear(next)}\n\n  return <main",
  "  function onEraJump(e){const next=Number(e.target.value);if(Number.isFinite(next))scrollToYear(next)}\n  function onMonthChange(e){const next=Number(e.target.value);if(Number.isFinite(next))setMonth(clamp(next,1,12))}\n\n  return <main",
  'month change handler'
);

renderer = replaceOnce(
  renderer,
  "<aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года · рельеф, постоянные границы, названия и гидрография</p></aside>",
  "<aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{MONTH_LABELS[month-1]} {year}</b></div><p>Исторический мировой срез {worldYear??'—'} года · {historyState?`History Core ${historyState.month} · ${historyState.status==='geometry-verified'?'проверенная геометрия':'реконструкция'}`:'аварийный архивный fallback'} · рельеф, границы, названия и гидрография</p></aside>",
  'story history status'
);

renderer = replaceOnce(
  renderer,
  "<span>Колесо мыши — 1 год</span>",
  "<span>Колесо мыши — 1 год · месяц справа</span>",
  'timeline hint'
);

renderer = replaceOnce(
  renderer,
  "<b className={styles.timelineYear}>{year}</b>",
  "<label className={styles.timelineDate}><b className={styles.timelineYear}>{year}</b><select aria-label=\"Месяц\" value={month} onChange={onMonthChange}>{MONTH_LABELS.map((label,index)=><option key={label} value={index+1}>{label}</option>)}</select></label>",
  'month selector'
);

fs.writeFileSync(rendererFile, renderer);

let css = fs.readFileSync(cssFile, 'utf8');
css = replaceOnce(
  css,
  ".timelineYear{grid-area:year}.timelineNext{grid-area:next}",
  ".timelineDate{grid-area:year;display:flex;align-items:center;justify-content:flex-end;gap:10px}.timelineDate select{width:70px;min-height:40px;border:1px solid rgba(213,194,145,.28);background:#07161b;color:#eee5cf;border-radius:10px;padding:0 24px 0 8px;font:600 16px/1 Georgia,serif;outline:none}.timelineYear{font-size:40px;color:#d8b66a;font-weight:500;letter-spacing:.03em}.timelineNext{grid-area:next}",
  'timeline date css'
);
css = replaceOnce(
  css,
  ".eraJump select{min-height:48px;font-size:16px}.timelineHead strong{font-size:22px}",
  ".eraJump select{min-height:48px;font-size:16px}.timelineDate{flex-direction:column;align-items:flex-end;gap:2px}.timelineDate select{width:68px;min-height:34px;font-size:16px}.timelineHead strong{font-size:22px}",
  'mobile month css'
);
fs.writeFileSync(cssFile, css);

let smoke = fs.readFileSync(smokeFile, 'utf8');
smoke = replaceOnce(
  smoke,
  "const consoleErrors = [];\npage.on('pageerror', error => pageErrors.push(String(error?.stack || error)));",
  "const consoleErrors = [];\nconst historyRequests = [];\npage.on('request', request => {\n  const requestUrl = request.url();\n  if (requestUrl.includes('/data/history-core/')) historyRequests.push(requestUrl);\n});\npage.on('pageerror', error => pageErrors.push(String(error?.stack || error)));",
  'smoke history request tracking'
);
smoke = replaceOnce(
  smoke,
  "  await page.waitForFunction(visibleCountryLabel, null, { timeout: 5000 });\n\n  const state = await page.evaluate(() => {",
  "  await page.waitForFunction(visibleCountryLabel, null, { timeout: 5000 });\n  await page.waitForFunction(() => document.body?.innerText?.includes('History Core'), null, { timeout: 8000 });\n  const monthSelect = page.getByLabel('Месяц');\n  if (await monthSelect.count() !== 1) throw new Error('History Core month selector missing');\n\n  const state = await page.evaluate(() => {",
  'smoke wait for History Core'
);
smoke = replaceOnce(
  smoke,
  "  if (!state.buttons.includes('Рельеф') || !state.buttons.includes('Государства')) {\n    throw new Error(`Territory controls missing: ${JSON.stringify(state.buttons)}`);\n  }\n\n  const zoomIn",
  "  if (!state.buttons.includes('Рельеф') || !state.buttons.includes('Государства')) {\n    throw new Error(`Territory controls missing: ${JSON.stringify(state.buttons)}`);\n  }\n  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/month-index.json'))) {\n    throw new Error(`Globe did not request History Core month index: ${JSON.stringify(historyRequests)}`);\n  }\n  if (!historyRequests.some(requestUrl => requestUrl.includes('/data/history-core/generated/') && !requestUrl.endsWith('/month-index.json'))) {\n    throw new Error(`Globe did not request month-resolved History Core geometry: ${JSON.stringify(historyRequests)}`);\n  }\n  await monthSelect.selectOption('2');\n  await page.waitForFunction(() => document.body?.innerText?.includes('History Core 2026-02'), null, { timeout: 8000 });\n\n  const zoomIn",
  'smoke History Core assertions'
);
fs.writeFileSync(smokeFile, smoke);

console.log('Applied monthly History Core globe integration patch.');
