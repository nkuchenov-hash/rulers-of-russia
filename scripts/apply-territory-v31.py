from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
s = renderer.read_text()

# 1) Keep the exact pre-ETOPO single-surface V26 globe. Only patch independent UI/control fixes.
if 'etopo30s/' in s or 'DETAIL_RELIEF_TILES' in s or 'detailGroup' in s:
    raise RuntimeError('V31 must start from the single-surface V26 renderer')

# 2) Correct CSS2D visibility. The renderer object controls visibility; DOM display:none must not fight it.
s = s.replace("el.style.cssText=`display:none;white-space:nowrap;", "el.style.cssText=`white-space:nowrap;", 1)
s = s.replace("el.style.cssText='display:none;white-space:nowrap;", "el.style.cssText='white-space:nowrap;", 1)
s = s.replace("for(const obj of group.children)obj.element.style.display='none';zoomIntentRef.current=false;", "for(const obj of group.children)obj.visible=false;zoomIntentRef.current=false;", 1)
s = s.replace("for(const obj of cityLabelsRef.current.children)obj.element.style.display='none'", "for(const obj of cityLabelsRef.current.children)obj.visible=false", 1)

# 3) De-duplicate shared world border segments and suppress the neighboring-country line on Russia's border.
old_build = "function buildPolygonSegments(features,radius=1.0002){const pos=[];for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;const step=Math.max(1,Math.ceil(ring.length/1800));for(let i=0;i<ring.length-1;i+=step){const a=ring[i],b=ring[Math.min(i+step,ring.length-1)];if(!a||!b)continue;const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);pos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)}}return pos}"
new_build = r'''function canonicalSegmentKey(a,b){const q=p=>`${Math.round(Number(p[0])*1e5)},${Math.round(Number(p[1])*1e5)}`,ka=q(a),kb=q(b);return ka<kb?`${ka}|${kb}`:`${kb}|${ka}`}
function boundaryGrid(features,cell=.5){const map=new Map(),segments=[];const put=(x,y,index)=>{const k=`${x},${y}`;let list=map.get(k);if(!list){list=[];map.set(k,list)}list.push(index)};for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(!a||!b)continue;let x1=Number(a[0]),x2=Number(b[0]);const y1=Number(a[1]),y2=Number(b[1]);if(![x1,x2,y1,y2].every(Number.isFinite))continue;if(x2-x1>180)x2-=360;else if(x2-x1<-180)x2+=360;const index=segments.length;segments.push([x1,y1,x2,y2]);const minX=Math.floor((Math.min(x1,x2)-.42)/cell),maxX=Math.floor((Math.max(x1,x2)+.42)/cell),minY=Math.floor((Math.min(y1,y2)-.42)/cell),maxY=Math.floor((Math.max(y1,y2)+.42)/cell);for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++)put(gx,gy,index)}}return{map,segments,cell}}
function pointSegmentDistance(lon,lat,seg){let[x1,y1,x2,y2]=seg;while(lon-x1>180)lon-=360;while(lon-x1<-180)lon+=360;const cos=Math.max(.2,Math.cos(lat*Math.PI/180)),dx=(x2-x1)*cos,dy=y2-y1,px=(lon-x1)*cos,py=lat-y1,len2=dx*dx+dy*dy;if(len2<=1e-12)return Math.hypot(px,py);const t=Math.max(0,Math.min(1,(px*dx+py*dy)/len2));return Math.hypot(px-t*dx,py-t*dy)}
function nearBoundary(lon,lat,grid,threshold=.32){if(!grid)return false;const gx=Math.floor(lon/grid.cell),gy=Math.floor(lat/grid.cell),seen=new Set();for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){for(const index of grid.map.get(`${gx+ox},${gy+oy}`)??[]){if(seen.has(index))continue;seen.add(index);if(pointSegmentDistance(lon,lat,grid.segments[index])<=threshold)return true}}return false}
function buildPolygonSegments(features,radius=1.00012,excludeNearFeatures=null){const pos=[],seen=new Set(),excludeGrid=excludeNearFeatures?.length?boundaryGrid(excludeNearFeatures):null;for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;const step=Math.max(1,Math.ceil(ring.length/1800));for(let i=0;i<ring.length-1;i+=step){const a=ring[i],b=ring[Math.min(i+step,ring.length-1)];if(!a||!b)continue;const key=canonicalSegmentKey(a,b);if(seen.has(key))continue;const midLon=(Number(a[0])+Number(b[0]))/2,midLat=(Number(a[1])+Number(b[1]))/2;if(excludeGrid&&(nearBoundary(midLon,midLat,excludeGrid)||nearBoundary(Number(a[0]),Number(a[1]),excludeGrid)||nearBoundary(Number(b[0]),Number(b[1]),excludeGrid)))continue;seen.add(key);const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);pos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)}}return pos}'''
if old_build not in s:
    raise RuntimeError('V26 buildPolygonSegments anchor not found')
s = s.replace(old_build, new_build, 1)
s = s.replace("const all=buildPolygonSegments(worldBorderFeatures,1.0002);", "const all=buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures);", 1)
s = s.replace("const ru=buildPolygonSegments(russiaFeatures,1.00022);", "const ru=buildPolygonSegments(russiaFeatures,1.00014);", 1)

# 4) Adaptive globe controls: progressively slower rotation and zoom as camera approaches surface.
old_controls = "const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.rotateSpeed=.68;controls.zoomSpeed=.72;controls.minDistance=1.03;controls.maxDistance=7;"
new_controls = "const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.rotateSpeed=.68;controls.zoomSpeed=.72;controls.minDistance=1.03;controls.maxDistance=7;const adaptiveControlSpeed=d=>{const close=clamp((d-1.03)/.72,0,1);controls.rotateSpeed=.12+.56*close;controls.zoomSpeed=.18+.54*close};adaptiveControlSpeed(camera.position.length());"
if old_controls not in s:
    raise RuntimeError('V26 OrbitControls anchor not found')
s = s.replace(old_controls, new_controls, 1)
old_change = "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};renderRef.current=render;const onChange=()=>{const d=camera.position.length();if(!runtime.suppressZoom&&d<1.2&&d<runtime.lastDistance-.0025)zoomIntentRef.current=true;if(d>CAPITAL_DISTANCE+.08)zoomIntentRef.current=false;runtime.lastDistance=d;render()};controls.addEventListener('change',onChange);"
new_change = "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};renderRef.current=render;const onChange=()=>{const d=camera.position.length();adaptiveControlSpeed(d);if(!runtime.suppressZoom&&d<1.2&&d<runtime.lastDistance-.0025)zoomIntentRef.current=true;if(d>CAPITAL_DISTANCE+.08)zoomIntentRef.current=false;runtime.lastDistance=d;render()};controls.addEventListener('change',onChange);"
if old_change not in s:
    raise RuntimeError('V26 controls change anchor not found')
s = s.replace(old_change, new_change, 1)

# 5) Timeline: one wheel tick = one year, plus stable era selector built from chronology transitions.
old_refs = "scrollFrame=useRef(null),zoomIntentRef=useRef(false);"
new_refs = "scrollFrame=useRef(null),timelineWheelRef=useRef(0),zoomIntentRef=useRef(false);"
if old_refs not in s:
    raise RuntimeError('V26 ref anchor not found')
s = s.replace(old_refs, new_refs, 1)
old_ticks = "const ticks=useMemo(()=>{const out=[];for(let y=Math.ceil(TERRITORY_MIN_YEAR/10)*10;y<=TERRITORY_MAX_YEAR;y+=10)out.push(y);return out},[]);"
new_ticks = old_ticks + "\n  const eraOptions=useMemo(()=>{const years=[TERRITORY_MIN_YEAR,...POLITY_TRANSITION_YEARS,TERRITORY_MAX_YEAR].filter((y,i,a)=>a.indexOf(y)===i).sort((a,b)=>a-b);return years.map(y=>({year:y,label:territoryPeriodAt(y).shortLabel})).filter((x,i,a)=>i===0||x.label!==a[i-1].label)},[]);"
if old_ticks not in s:
    raise RuntimeError('V26 ticks anchor not found')
s = s.replace(old_ticks, new_ticks, 1)
old_wheel = "function onTimelineWheel(e){const el=timelineRef.current;if(!el)return;const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!raw)return;e.preventDefault();el.scrollLeft+=raw*.58}"
new_wheel = "function onTimelineWheel(e){const el=timelineRef.current;if(!el)return;const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!raw)return;e.preventDefault();const now=performance.now();if(now-timelineWheelRef.current<62)return;timelineWheelRef.current=now;const current=clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);scrollToYear(current+(raw>0?1:-1),'auto')}"
if old_wheel not in s:
    raise RuntimeError('V26 timeline wheel anchor not found')
s = s.replace(old_wheel, new_wheel, 1)
old_jump = "function jump(dir){const list=dir>0?snapshots.filter(y=>y>year):snapshots.filter(y=>y<year).reverse();if(list.length)scrollToYear(list[0])}"
new_jump = old_jump + "\n  function onEraJump(e){const next=Number(e.target.value);if(Number.isFinite(next))scrollToYear(next)}"
s = s.replace(old_jump, new_jump, 1)
old_head = "<section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div>"
new_head = "<section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button className={styles.timelinePrev} onClick={()=>jump(-1)}>‹</button><div className={styles.timelineTitle}><strong>{period.shortLabel}</strong><span>Колесо мыши — 1 год</span></div><label className={styles.eraJump}><span>Эпоха</span><select aria-label=\"Быстрый переход к эпохе\" value={eraOptions.reduce((best,x)=>x.year<=year?x.year:best,eraOptions[0]?.year??TERRITORY_MIN_YEAR)} onChange={onEraJump}>{eraOptions.map(x=><option key={x.year} value={x.year}>{x.label} · {x.year}</option>)}</select></label><b className={styles.timelineYear}>{year}</b><button className={styles.timelineNext} onClick={()=>jump(1)}>›</button></div>"
if old_head not in s:
    raise RuntimeError('V26 timeline head anchor not found')
s = s.replace(old_head, new_head, 1)

renderer.write_text(s)

check = renderer.read_text()
required = [
    'earth_relief_16380.webp',
    'adaptiveControlSpeed',
    'timelineWheelRef',
    'eraOptions',
    'canonicalSegmentKey',
    'buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures)',
    'obj.visible=show',
    'obj.visible=front&&nearEnough',
]
for token in required:
    if token not in check:
        raise RuntimeError(f'missing V31 token: {token}')
for forbidden in ['etopo30s/', 'DETAIL_RELIEF_TILES', 'detailGroup', "element.style.display='none'"]:
    if forbidden in check:
        raise RuntimeError(f'forbidden V31 runtime token remains: {forbidden}')

print('V31 stable single-surface renderer verified.')
