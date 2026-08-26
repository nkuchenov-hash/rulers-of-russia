from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
css_file = ROOT / 'src/app/territory/territory-webgl.module.css'

s = renderer.read_text()

replacements = [
    (
        "import {POLITY_TRANSITION_YEARS,TERRITORY_MAX_YEAR,TERRITORY_MIN_YEAR,territoryPeriodAt} from './territoryChronology';",
        "import {POLITY_TRANSITION_YEARS,TERRITORY_MAX_YEAR,TERRITORY_MIN_YEAR,TERRITORY_PERIODS,territoryPeriodAt} from './territoryChronology';",
    ),
    (
        "function lonDistance(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d}\nfunction makeLatLonPatchGeometry(tile,radius=1.000025){const lonSeg=96,latSeg=72,pos=[],uv=[],idx=[];for(let y=0;y<=latSeg;y++){const fy=y/latSeg,lat=tile.lat0+(tile.lat1-tile.lat0)*fy;for(let x=0;x<=lonSeg;x++){const fx=x/lonSeg,lon=tile.lon0+(tile.lon1-tile.lon0)*fx,p=latLonVector(lat,lon,radius);pos.push(p.x,p.y,p.z);uv.push(fx,fy)}}for(let y=0;y<latSeg;y++)for(let x=0;x<lonSeg;x++){const a=y*(lonSeg+1)+x,b=a+1,c=a+(lonSeg+1),d=c+1;idx.push(a,c,b,b,c,d)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}\nfunction ensureDetailTile(runtime,tile){if(runtime.detailTiles.has(tile.id))return runtime.detailTiles.get(tile.id);const geometry=makeLatLonPatchGeometry(tile),material=new THREE.MeshBasicMaterial({transparent:false,depthWrite:true,depthTest:true});material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-.75;const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;mesh.renderOrder=2;mesh.userData={tile,loaded:false};runtime.detailTiles.set(tile.id,mesh);runtime.detailGroup.add(mesh);runtime.detailLoader.load(`${runtime.base}/data/territory/terrain/etopo30s/${tile.id}.webp`,tex=>{tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;tex.anisotropy=Math.min(16,runtime.renderer.capabilities.getMaxAnisotropy());material.map=tex;material.needsUpdate=true;mesh.userData.loaded=true;runtime.render?.()},undefined,()=>{});return mesh}",
        "function lonDistance(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d}\nfunction adaptiveControlSpeed(controls,d){const altitude=Math.max(0,d-1),t=clamp((altitude-.03)/1.25,0,1),ease=Math.pow(t,.58);controls.rotateSpeed=.075+.605*ease;controls.zoomSpeed=.18+.54*ease}\nfunction makeLatLonPatchGeometry(tile,radius=1.00032){const lonSeg=96,latSeg=72,pos=[],uv=[],idx=[];for(let y=0;y<=latSeg;y++){const fy=y/latSeg,lat=tile.lat0+(tile.lat1-tile.lat0)*fy;for(let x=0;x<=lonSeg;x++){const fx=x/lonSeg,lon=tile.lon0+(tile.lon1-tile.lon0)*fx,p=latLonVector(lat,lon,radius);pos.push(p.x,p.y,p.z);uv.push(fx,fy)}}for(let y=0;y<latSeg;y++)for(let x=0;x<lonSeg;x++){const a=y*(lonSeg+1)+x,b=a+1,c=a+(lonSeg+1),d=c+1;idx.push(a,b,c,b,d,c)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}\nfunction ensureDetailTile(runtime,tile){if(runtime.detailTiles.has(tile.id))return runtime.detailTiles.get(tile.id);const geometry=makeLatLonPatchGeometry(tile),material=new THREE.MeshBasicMaterial({transparent:false,depthWrite:false,depthTest:true,side:THREE.DoubleSide});material.polygonOffset=true;material.polygonOffsetFactor=-4;material.polygonOffsetUnits=-6;const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;mesh.renderOrder=2;mesh.userData={tile,loaded:false};runtime.detailTiles.set(tile.id,mesh);runtime.detailGroup.add(mesh);runtime.detailLoader.load(`${runtime.base}/data/territory/terrain/etopo30s/${tile.id}.webp`,tex=>{tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;tex.anisotropy=Math.min(16,runtime.renderer.capabilities.getMaxAnisotropy());material.map=tex;material.needsUpdate=true;mesh.userData.loaded=true;runtime.render?.()},undefined,()=>{});return mesh}",
    ),
    (
        "const hostRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),renderRef=useRef(()=>{}),stateTextureRef=useRef(null),borderRef=useRef(null),riverRef=useRef(null),countryLabelsRef=useRef(null),cityLabelsRef=useRef(null),scrollFrame=useRef(null),zoomIntentRef=useRef(false);",
        "const hostRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),renderRef=useRef(()=>{}),stateTextureRef=useRef(null),borderRef=useRef(null),riverRef=useRef(null),countryLabelsRef=useRef(null),cityLabelsRef=useRef(null),scrollFrame=useRef(null),timelineWheelRef=useRef(0),zoomIntentRef=useRef(false);",
    ),
    (
        "const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.rotateSpeed=.68;controls.zoomSpeed=.72;controls.minDistance=1.03;controls.maxDistance=7;",
        "const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.minDistance=1.03;controls.maxDistance=7;adaptiveControlSpeed(controls,camera.position.length());",
    ),
    (
        "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};runtime.render=render;renderRef.current=render;const onChange=()=>{const d=camera.position.length();if(!runtime.suppressZoom&&d<1.2&&d<runtime.lastDistance-.0025)zoomIntentRef.current=true;if(d>CAPITAL_DISTANCE+.08)zoomIntentRef.current=false;runtime.lastDistance=d;render()};controls.addEventListener('change',onChange);",
        "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};runtime.render=render;renderRef.current=render;const onChange=()=>{const d=camera.position.length();adaptiveControlSpeed(controls,d);if(!runtime.suppressZoom&&d<1.2&&d<runtime.lastDistance-.0025)zoomIntentRef.current=true;if(d>CAPITAL_DISTANCE+.08)zoomIntentRef.current=false;runtime.lastDistance=d;render()};controls.addEventListener('change',onChange);",
    ),
    (
        "function onTimelineWheel(e){const el=timelineRef.current;if(!el)return;const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!raw)return;e.preventDefault();el.scrollLeft+=raw*.58}\n  function jump(dir){const list=dir>0?snapshots.filter(y=>y>year):snapshots.filter(y=>y<year).reverse();if(list.length)scrollToYear(list[0])}",
        "function onTimelineWheel(e){const el=timelineRef.current;if(!el)return;const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!raw)return;e.preventDefault();const now=performance.now();if(now-timelineWheelRef.current<62)return;timelineWheelRef.current=now;const current=clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);scrollToYear(current+(raw>0?1:-1),'auto')}\n  function jump(dir){const list=dir>0?snapshots.filter(y=>y>year):snapshots.filter(y=>y<year).reverse();if(list.length)scrollToYear(list[0])}\n  function onPeriodJump(e){const next=TERRITORY_PERIODS.find(p=>p.polityId===e.target.value);if(next)scrollToYear(next.start)}",
    ),
    (
        "<section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}>",
        "<section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button className={styles.timelinePrev} onClick={()=>jump(-1)}>‹</button><div className={styles.timelineTitle}><strong>{period.shortLabel}</strong><span>Колесо мыши — 1 год</span></div><label className={styles.eraJump}><span>Эпоха</span><select aria-label=\"Быстрый переход к эпохе\" value={period.polityId} onChange={onPeriodJump}>{TERRITORY_PERIODS.map(p=><option key={p.polityId} value={p.polityId}>{p.shortLabel} · {p.start}</option>)}</select></label><b className={styles.timelineYear}>{year}</b><button className={styles.timelineNext} onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}>",
    ),
]

for old, new in replacements:
    if old not in s:
        raise RuntimeError(f'Renderer anchor not found: {old[:120]}')
    s = s.replace(old, new, 1)

renderer.write_text(s)

css = css_file.read_text()
css_replacements = [
    (
        ".timelineHead{height:92px;display:grid;grid-template-columns:56px 1fr auto 56px;gap:12px;align-items:center;padding:0 18px}",
        ".timelineHead{height:92px;display:grid;grid-template-areas:'prev title jump year next';grid-template-columns:56px minmax(220px,1fr) minmax(220px,300px) auto 56px;gap:12px;align-items:center;padding:0 18px}.timelinePrev{grid-area:prev}.timelineTitle{grid-area:title;min-width:0}.eraJump{grid-area:jump;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;min-width:0}.eraJump>span{color:rgba(235,225,203,.52);font:600 14px/1 system-ui,sans-serif;white-space:nowrap}.eraJump select{width:100%;min-height:44px;border:1px solid rgba(213,194,145,.28);background:#07161b;color:#eee5cf;border-radius:12px;padding:0 36px 0 12px;font:600 16px/1 Georgia,serif;outline:none}.timelineYear{grid-area:year}.timelineNext{grid-area:next}",
    ),
    (
        ".timelineHead{height:86px;grid-template-columns:52px 1fr auto 52px;gap:8px;padding:0 10px}",
        ".timelineHead{height:142px;grid-template-areas:'prev title year next' '. jump jump .';grid-template-columns:52px minmax(0,1fr) auto 52px;grid-template-rows:76px 54px;gap:6px 8px;padding:4px 10px 8px}.eraJump{grid-template-columns:1fr}.eraJump>span{display:none}.eraJump select{min-height:48px;font-size:16px}",
    ),
    (
        ".timelineHead span{font-size:11px}",
        ".timelineHead span{font-size:16px}",
    ),
]
for old, new in css_replacements:
    if old not in css:
        raise RuntimeError(f'CSS anchor not found: {old}')
    css = css.replace(old, new, 1)
css_file.write_text(css)

checks = [
    "adaptiveControlSpeed(controls,d)",
    "idx.push(a,b,c,b,d,c)",
    "depthWrite:false,depthTest:true,side:THREE.DoubleSide",
    "scrollToYear(current+(raw>0?1:-1),'auto')",
    "TERRITORY_PERIODS.map",
]
for check in checks:
    if check not in renderer.read_text():
        raise RuntimeError(f'Verification failed: {check}')
if ".eraJump" not in css_file.read_text():
    raise RuntimeError('Era jump styles missing')
print('V28 renderer and timeline patch verified.')
