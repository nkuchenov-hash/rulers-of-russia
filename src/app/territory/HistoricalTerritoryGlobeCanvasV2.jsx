'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoDistance, geoGraticule, geoNaturalEarth1, geoOrthographic, geoPath } from 'd3-geo';
import { POLITY_TRANSITION_YEARS, TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR, territoryPeriodAt } from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-globe.module.css';

const sphere={type:'Sphere'};
const graticule=geoGraticule().step([10,10])();
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const yearPart=v=>{const m=String(v??'').match(/-?\d{3,4}/);return m?Number(m[0]):null;};
const reverseRing=r=>[...r].reverse();
const RU={Russia:'Россия',US:'США',USA:'США',Canada:'Канада',Greenland:'Гренландия',Iceland:'Исландия',Norway:'Норвегия',Sweden:'Швеция',Finland:'Финляндия',Denmark:'Дания',Poland:'Польша',Germany:'Германия',France:'Франция',Italy:'Италия',Spain:'Испания',UK:'Великобритания',Ireland:'Ирландия',Belarus:'Беларусь',Ukraine:'Украина',Lithuania:'Литва',Latvia:'Латвия',Estonia:'Эстония',Georgia:'Грузия',Armenia:'Армения',Azerbaijan:'Азербайджан',Kazakhstan:'Казахстан',China:'Китай',Mongolia:'Монголия',India:'Индия',Pakistan:'Пакистан',Afghanistan:'Афганистан',Iran:'Иран',Iraq:'Ирак',Turkey:'Турция',Syria:'Сирия',Egypt:'Египет',Japan:'Япония',Korea:'Корея','Golden Horde':'Золотая Орда',Novgorod:'Новгород',Muscovy:'Москва','Grand Duchy of Moscow':'Московское княжество',Byzantium:'Византия','Ottoman Empire':'Османская империя','Polish-Lithuanian Commonwealth':'Речь Посполитая','Grand Duchy of Lithuania':'Великое княжество Литовское'};
const PALETTE=['#4e6253','#665948','#46615f','#684c49','#4d6552','#5a5262','#6c6345','#435953','#63564b'];

function normalizeFeature(f){
  if(!f?.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type))return null;
  let next=f;
  if(geoArea(next)>Math.PI*2){
    const g=next.geometry.type==='Polygon'?{type:'Polygon',coordinates:next.geometry.coordinates.map(reverseRing)}:{type:'MultiPolygon',coordinates:next.geometry.coordinates.map(poly=>poly.map(reverseRing))};
    next={...next,geometry:g};
  }
  const a=geoArea(next);
  return Number.isFinite(a)&&a>0&&a<2.2?next:null;
}
const normalizeCollection=c=>({...c,features:(c.features||[]).map(normalizeFeature).filter(Boolean)});
function featureName(f){const p=f.properties||{};return [p.ABBREVN,p.NAME,p.SUBJECTO,p.PARTOF,p.name,p.ADMIN,p.entity,p.polity].find(x=>typeof x==='string'&&x.trim())?.trim()||'';}
function colorFor(f,i){const n=featureName(f);let h=23+i;for(let k=0;k<n.length;k++)h=((h<<5)-h+n.charCodeAt(k))|0;return PALETTE[Math.abs(h)%PALETTE.length];}
function validAt(f,y){const s=yearPart(f.properties?.start_date),e=yearPart(f.properties?.end_date);return(s===null||y>=s)&&(e===null||y<=e);}
function selectRussia(c,y){if(!c?.features?.length)return[];const exact=c.features.filter(f=>validAt(f,y));if(exact.length)return exact;const p=c.features.map(feature=>({feature,start:yearPart(feature.properties?.start_date)})).filter(x=>x.start!==null&&x.start<=y).sort((a,b)=>b.start-a.start);return p.length?p.filter(x=>x.start===p[0].start).map(x=>x.feature):[];}

function useHistoricalData(year,polityId){
  const [index,setIndex]=useState(null),[manifest,setManifest]=useState(null),[world,setWorld]=useState(null),[worldYear,setWorldYear]=useState(null),[russia,setRussia]=useState(null);
  const wc=useRef(new Map()),rc=useRef(new Map());
  useEffect(()=>{const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();Promise.all([fetch(`${base}/data/territory/world-history/index.json`,{signal:c.signal}).then(r=>r.json()),fetch(`${base}/data/territory/archive/manifest.json`,{signal:c.signal}).then(r=>r.json())]).then(([a,b])=>{if(!c.signal.aborted){setIndex(a);setManifest(b);}}).catch(()=>{});return()=>c.abort();},[]);
  useEffect(()=>{if(!index?.snapshots?.length)return;const list=[...index.snapshots].sort((a,b)=>a.year-b.year),s=[...list].reverse().find(x=>x.year<=year)||list[0],cached=wc.current.get(s.file);if(cached){setWorld(cached);setWorldYear(s.year);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();fetch(`${base}/data/territory/world-history/${s.file}`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{wc.current.set(s.file,d);if(!c.signal.aborted){setWorld(d);setWorldYear(s.year);}}).catch(()=>{});return()=>c.abort();},[index,year]);
  useEffect(()=>{const e=manifest?.polities?.find(p=>p.polity_id===polityId&&p.file&&p.features>0);if(!e?.file){setRussia(null);return;}const cached=rc.current.get(e.file);if(cached){setRussia(cached);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();fetch(`${base}/data/territory/archive/${e.file}`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{rc.current.set(e.file,d);if(!c.signal.aborted)setRussia(d);}).catch(()=>{});return()=>c.abort();},[manifest,polityId]);
  return{index,world,worldYear,russia};
}

function drawStar(ctx,x,y,r=5){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r,px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
function createPaperTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.clearRect(0,0,128,128);for(let i=0;i<120;i++){const a=.018+(i%7)*.004;x.fillStyle=`rgba(242,224,176,${a})`;x.fillRect((i*47)%128,(i*79)%128,1+(i%2),1);}for(let y=9;y<128;y+=16){x.strokeStyle='rgba(235,218,174,.025)';x.lineWidth=.6;x.beginPath();for(let xx=0;xx<=128;xx+=6){const yy=y+Math.sin((xx+y)*.09)*2.5;xx?x.lineTo(xx,yy):x.moveTo(xx,yy);}x.stroke();}return c;}

export function HistoricalTerritoryGlobeCanvasV2({initialYear=TERRITORY_MAX_YEAR}){
  const sceneRef=useRef(null),canvasRef=useRef(null),rotationRef=useRef([-64,-48,0]),zoomRef=useRef(1.45),drag=useRef({active:false,x:0,y:0,lastX:0,lastY:0,lastT:0,vx:0,vy:0}),raf=useRef(null),texture=useRef(null),pointers=useRef(new Map()),pinch=useRef(null);
  const [viewport,setViewport]=useState({width:1600,height:900}),[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[viewMode,setViewMode]=useState('globe'),[rotation,setRotation]=useState([-64,-48,0]),[zoom,setZoom]=useState(1.45),[dragging,setDragging]=useState(false),[fullscreen,setFullscreen]=useState(false),[showBorders,setShowBorders]=useState(true);
  const period=territoryPeriodAt(year),{index,world,worldYear,russia}=useHistoricalData(year,period.polityId),portrait=viewport.height>viewport.width*1.08;
  const russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]),russiaCollection=useMemo(()=>({type:'FeatureCollection',features:russiaFeatures}),[russiaFeatures]);
  useEffect(()=>{rotationRef.current=rotation;},[rotation]);useEffect(()=>{zoomRef.current=zoom;},[zoom]);
  useEffect(()=>{texture.current=createPaperTexture();},[]);
  useEffect(()=>{const n=sceneRef.current;if(!n)return;const u=()=>{const r=n.getBoundingClientRect();if(r.width&&r.height)setViewport({width:Math.round(r.width),height:Math.round(r.height)});};u();const ro=new ResizeObserver(u);ro.observe(n);return()=>ro.disconnect();},[]);
  useEffect(()=>{const h=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h);},[]);

  const projection=useMemo(()=>{const{width,height}=viewport;if(viewMode==='map')return geoNaturalEarth1().translate([width/2,height*(portrait?.45:.5)]).scale(Math.min(width/5.7,height/3.15)*zoom).precision(1.15);const radius=portrait?Math.min(width*.48,height*.32):Math.min(width*.34,height*.46);return geoOrthographic().translate([width*(portrait?.5:.62),height*(portrait?.44:.5)]).scale(radius*zoom).rotate(rotation).clipAngle(90).precision(1.3);},[viewport,viewMode,portrait,zoom,rotation]);

  const labels=useMemo(()=>{if(dragging)return[];const out=[],center=[-rotation[0],-rotation[1]],mobile=portrait;if(russiaFeatures.length){const g=geoCentroid(russiaCollection),p=projection(g);if(p&&(viewMode!=='globe'||geoDistance(g,center)<Math.PI/2-.05))out.push({text:period.label,x:p[0],y:p[1],size:mobile?17:21,kind:'russia',priority:99999});}if(world){const cc=[];for(const f of world.features){const n=featureName(f);if(!n||/russia|russian|росси/i.test(n))continue;const g=geoCentroid(f);if(viewMode==='globe'&&geoDistance(g,center)>Math.PI/2-.07)continue;const p=projection(g);if(!p)continue;const a=geoArea(f);cc.push({text:RU[n]||n,x:p[0],y:p[1],size:clamp(11+Math.sqrt(a)*7,mobile?11:12,mobile?15:18),kind:'country',priority:a});}cc.sort((a,b)=>b.priority-a.priority);out.push(...cc.slice(0,mobile?(zoom<2?7:zoom<3?11:17):22));}const pp=[];for(const p of TERRITORY_PLACES){if((p.from??TERRITORY_MIN_YEAR)>year||(p.to??TERRITORY_MAX_YEAR)<year)continue;if(mobile&&p.kind==='regional'&&zoom<2.5)continue;if(viewMode==='globe'&&geoDistance([p.lon,p.lat],center)>Math.PI/2-.07)continue;const q=projection([p.lon,p.lat]);if(q)pp.push({text:p.name,x:q[0],y:q[1],size:p.kind==='capital'?12:10,kind:p.kind,priority:p.kind==='capital'?2:1});}pp.sort((a,b)=>b.priority-a.priority);out.push(...pp.slice(0,mobile?(zoom<2?4:zoom<3?9:20):32));return out;},[dragging,rotation,portrait,projection,russiaCollection,russiaFeatures.length,period.label,viewMode,world,year,zoom]);

  const draw=useCallback(()=>{
    const canvas=canvasRef.current;if(!canvas)return;const{width,height}=viewport,dpr=Math.min(window.devicePixelRatio||1,portrait?1.35:1.75),cw=Math.round(width*dpr),ch=Math.round(height*dpr);if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;}
    const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);const path=geoPath(projection,ctx);
    const ocean=ctx.createRadialGradient(width*.34,height*.23,8,width*.55,height*.55,Math.max(width,height)*.72);ocean.addColorStop(0,'#17404d');ocean.addColorStop(.46,'#082732');ocean.addColorStop(1,'#020d13');ctx.beginPath();path(sphere);ctx.fillStyle=viewMode==='globe'?ocean:'#07171e';ctx.fill();
    if(viewMode==='globe'){
      ctx.save();ctx.beginPath();path(sphere);ctx.clip();
      const glow=ctx.createRadialGradient(width*.31,height*.2,0,width*.31,height*.2,Math.max(width,height)*.58);glow.addColorStop(0,'rgba(135,180,181,.14)');glow.addColorStop(.55,'rgba(10,45,55,.02)');glow.addColorStop(1,'rgba(0,0,0,.24)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);ctx.restore();
    }
    ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(195,215,208,.16)';ctx.lineWidth=.6;ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=1.2;ctx.stroke();ctx.shadowBlur=0;
    for(let i=0;i<(world?.features?.length||0);i++){
      const f=world.features[i];ctx.beginPath();path(f);ctx.fillStyle=colorFor(f,i);ctx.fill();if(showBorders){ctx.strokeStyle='rgba(239,224,188,.40)';ctx.lineWidth=.52;ctx.stroke();}
    }
    if(world?.features?.length){
      ctx.save();ctx.globalCompositeOperation='source-atop';if(texture.current){ctx.globalAlpha=.72;ctx.fillStyle=ctx.createPattern(texture.current,'repeat');ctx.fillRect(0,0,width,height);ctx.globalAlpha=1;}
      const relief=ctx.createLinearGradient(width*.15,height*.1,width*.9,height*.88);relief.addColorStop(0,'rgba(244,220,159,.18)');relief.addColorStop(.36,'rgba(151,160,104,.04)');relief.addColorStop(.68,'rgba(0,0,0,.10)');relief.addColorStop(1,'rgba(0,0,0,.30)');ctx.fillStyle=relief;ctx.fillRect(0,0,width,height);ctx.restore();
    }
    if(russiaFeatures.length){ctx.beginPath();path(russiaCollection);ctx.fillStyle='#31583d';ctx.fill();ctx.save();ctx.clip();const rg=ctx.createLinearGradient(width*.22,height*.14,width*.82,height*.84);rg.addColorStop(0,'rgba(214,204,123,.24)');rg.addColorStop(.42,'rgba(68,103,66,.02)');rg.addColorStop(1,'rgba(0,0,0,.34)');ctx.fillStyle=rg;ctx.fillRect(0,0,width,height);ctx.restore();ctx.beginPath();path(russiaCollection);ctx.strokeStyle='#e1c46d';ctx.lineWidth=.82;ctx.stroke();}
    if(viewMode==='globe'){ctx.beginPath();path(sphere);ctx.strokeStyle='rgba(232,216,171,.72)';ctx.lineWidth=.9;ctx.shadowColor='rgba(218,194,127,.22)';ctx.shadowBlur=3;ctx.stroke();ctx.shadowBlur=0;}
    if(!dragging){ctx.textBaseline='middle';for(const l of labels){ctx.font=`${l.kind==='russia'?500:400} ${l.size}px Georgia, 'Times New Roman', serif`;ctx.textAlign=['capital','regional'].includes(l.kind)?'left':'center';const tx=l.x+(l.kind==='capital'?9:l.kind==='regional'?6:0);ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='rgba(1,10,13,.82)';ctx.strokeText(l.text,tx,l.y);ctx.fillStyle=l.kind==='russia'?'#f1e4c1':'#eadfc1';ctx.fillText(l.text,tx,l.y);if(l.kind==='capital'){ctx.fillStyle='#f4d993';drawStar(ctx,l.x,l.y,5.5);}else if(l.kind==='regional'){ctx.fillStyle='#eee1bc';ctx.beginPath();ctx.arc(l.x,l.y,2.1,0,Math.PI*2);ctx.fill();}}}
  },[viewport,portrait,projection,viewMode,world,showBorders,russiaFeatures.length,russiaCollection,labels,dragging]);
  useEffect(()=>{if(raf.current)cancelAnimationFrame(raf.current);raf.current=requestAnimationFrame(draw);return()=>{if(raf.current)cancelAnimationFrame(raf.current);};},[draw]);

  const commitRotation=useCallback((r)=>{rotationRef.current=r;setRotation(r);},[]);
  function stopInertia(){if(raf.current){cancelAnimationFrame(raf.current);raf.current=null;}}
  function onPointerDown(e){stopInertia();e.currentTarget.setPointerCapture?.(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...pointers.current.values()];if(pts.length===2){pinch.current={d:Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),z:zoomRef.current};drag.current.active=false;return;}if(viewMode!=='globe')return;drag.current={active:true,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,lastT:performance.now(),vx:0,vy:0};setDragging(true);}
  function onPointerMove(e){if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...pointers.current.values()];if(pts.length===2){const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(!pinch.current)pinch.current={d,z:zoomRef.current};const z=clamp(pinch.current.z*d/Math.max(20,pinch.current.d),.82,9);zoomRef.current=z;setZoom(z);return;}if(!drag.current.active||viewMode!=='globe')return;const now=performance.now(),dx=e.clientX-drag.current.lastX,dy=e.clientY-drag.current.lastY,dt=Math.max(8,now-drag.current.lastT),sens=.24/Math.sqrt(zoomRef.current),r=rotationRef.current,n=[r[0]+dx*sens,clamp(r[1]-dy*sens,-82,82),0];drag.current.vx=dx*sens/dt;drag.current.vy=-dy*sens/dt;drag.current.lastX=e.clientX;drag.current.lastY=e.clientY;drag.current.lastT=now;commitRotation(n);}
  function onPointerUp(e){pointers.current.delete(e.pointerId);if(pointers.current.size<2)pinch.current=null;if(!drag.current.active){setDragging(false);return;}drag.current.active=false;let vx=drag.current.vx*16,vy=drag.current.vy*16;const animate=()=>{vx*=.94;vy*=.94;if(Math.abs(vx)+Math.abs(vy)<.012){setDragging(false);return;}const r=rotationRef.current;commitRotation([r[0]+vx,clamp(r[1]+vy,-82,82),0]);raf.current=requestAnimationFrame(animate);};raf.current=requestAnimationFrame(animate);}
  function changeZoom(delta){const z=clamp(zoomRef.current+delta,viewMode==='globe'?.82:.7,viewMode==='globe'?9:7);zoomRef.current=z;setZoom(z);}
  function focusRussia(){const[lon,lat]=period.focus,r=[-lon,-lat,0],z=viewMode==='globe'?1.55:1.12;rotationRef.current=r;zoomRef.current=z;setRotation(r);setZoom(z);}
  useEffect(()=>{focusRussia();},[period.polityId]);
  const snapshots=useMemo(()=>{const s=new Set(POLITY_TRANSITION_YEARS);for(const x of index?.snapshots||[])s.add(x.year);s.add(TERRITORY_MAX_YEAR);return[...s].filter(y=>y>=TERRITORY_MIN_YEAR&&y<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  function jump(dir){const a=dir>0?snapshots.filter(x=>x>year):snapshots.filter(x=>x<year).reverse();if(a.length)setYear(a[0]);}
  async function toggleFullscreen(){if(!sceneRef.current)return;if(document.fullscreenElement)await document.exitFullscreen();else await sceneRef.current.requestFullscreen();}

  return <main className={`${styles.page} premiumTerritoryPage`}><section ref={sceneRef} className={`${styles.scene} premiumTerritoryScene`}>
    <div className={styles.space} aria-hidden="true"/><canvas ref={canvasRef} className={`${styles.globe} ${styles.globeInteractive}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={e=>{e.preventDefault();changeZoom(e.deltaY>0?-.22:.22);}}/>
    <header className={styles.topbar}><div className={styles.brand}><span className={styles.brandSymbol}>Р</span><div><strong>Правители России</strong><span>Исторический глобус</span></div></div><div className={styles.topControls}><div className={styles.segmented}><button className={viewMode==='globe'?styles.active:''} onClick={()=>setViewMode('globe')}>Глобус</button><button className={viewMode==='map'?styles.active:''} onClick={()=>setViewMode('map')}>Карта</button></div><button className={styles.controlButton} onClick={focusRussia}>К России</button><button className={styles.controlButton} onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
    <aside className={styles.story}><div className={styles.eyebrow}>{period.era}</div><div className={styles.storyRow}><h1>{period.label}</h1><span className={styles.storyYear}>{year}</span></div><p>Исторический мировой срез {worldYear??'—'} года · границы, города и картографический рельеф.</p></aside>
    <div className={styles.mapTools}><button onClick={()=>changeZoom(.45)}>+</button><button onClick={()=>changeZoom(-.45)}>−</button><button onClick={()=>setShowBorders(v=>!v)} className={showBorders?styles.toolActive:''}>◎</button></div>
    <section className={styles.timeline}><div className={styles.timelineTop}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>{TERRITORY_MIN_YEAR} — {TERRITORY_MAX_YEAR}</span></div><div className={styles.timelineCurrent}>{year}</div><button onClick={()=>jump(1)}>›</button></div><div className={styles.rangeRow}><span>{TERRITORY_MIN_YEAR}</span><div className={styles.rangeTrack}><input type="range" min={TERRITORY_MIN_YEAR} max={TERRITORY_MAX_YEAR} step={1} value={year} onChange={e=>setYear(clamp(Number(e.target.value),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR))}/><div className={styles.marks}>{snapshots.map(v=><i key={v} style={{left:`${((v-TERRITORY_MIN_YEAR)/(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR))*100}%`}}/>)}</div></div><span>{TERRITORY_MAX_YEAR}</span></div></section>
  </section></main>;
}
