'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { POLITY_TRANSITION_YEARS, TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR, territoryPeriodAt } from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-webgl.module.css';

const sphere = { type: 'Sphere' };
const graticule = geoGraticule10();
const TWO_PI = Math.PI * 2;
const MAX_FEATURE_AREA = 2.2;
const YEAR_PX = 5;
const TEXTURE_W_DESKTOP = 3072;
const TEXTURE_W_MOBILE = 2048;
const PALETTE = ['#59694f','#6b5b48','#4a6764','#72514c','#536b54','#60566d','#746d46','#4b6259','#6c5f4d','#435b67','#735c60'];
const RU = {
  Russia:'Россия', US:'США', USA:'США', Canada:'Канада', Greenland:'Гренландия', Iceland:'Исландия', Norway:'Норвегия', Sweden:'Швеция', Finland:'Финляндия', Denmark:'Дания', Poland:'Польша', Germany:'Германия', France:'Франция', Italy:'Италия', Spain:'Испания', Portugal:'Португалия', UK:'Великобритания', Ireland:'Ирландия', Belarus:'Беларусь', Ukraine:'Украина', Lithuania:'Литва', Latvia:'Латвия', Estonia:'Эстония', Georgia:'Грузия', Armenia:'Армения', Azerbaijan:'Азербайджан', Kazakhstan:'Казахстан', China:'Китай', Mongolia:'Монголия', India:'Индия', Pakistan:'Пакистан', Afghanistan:'Афганистан', Iran:'Иран', Iraq:'Ирак', Turkey:'Турция', Syria:'Сирия', Egypt:'Египет', Japan:'Япония', Korea:'Корея', Greece:'Греция', Austria:'Австрия', Hungary:'Венгрия', Romania:'Румыния', Bulgaria:'Болгария', Serbia:'Сербия', 'Golden Horde':'Золотая Орда', Novgorod:'Новгород', Muscovy:'Москва', 'Grand Duchy of Moscow':'Московское княжество', Byzantium:'Византия', 'Ottoman Empire':'Османская империя', 'Polish-Lithuanian Commonwealth':'Речь Посполитая', 'Grand Duchy of Lithuania':'Великое княжество Литовское'
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const yearPart = (v) => { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
const reverseRing = (ring) => [...ring].reverse();
function normalizeFeature(feature) {
  if (!feature?.geometry || !['Polygon','MultiPolygon'].includes(feature.geometry.type)) return null;
  let next = feature;
  if (geoArea(next) > TWO_PI) {
    const geometry = feature.geometry.type === 'Polygon'
      ? { type:'Polygon', coordinates: feature.geometry.coordinates.map(reverseRing) }
      : { type:'MultiPolygon', coordinates: feature.geometry.coordinates.map((poly) => poly.map(reverseRing)) };
    next = { ...feature, geometry };
  }
  const area = geoArea(next);
  if (!Number.isFinite(area) || area <= 0 || area > MAX_FEATURE_AREA) return null;
  return next;
}
function normalizeCollection(collection) {
  return { ...collection, features: (collection?.features ?? []).map(normalizeFeature).filter(Boolean) };
}
function featureName(feature) {
  const p = feature?.properties ?? {};
  return [p.ABBREVN,p.NAME,p.SUBJECTO,p.PARTOF,p.name,p.ADMIN,p.entity,p.polity].find((x) => typeof x === 'string' && x.trim())?.trim() ?? '';
}
function featureColor(feature, index) {
  const name = featureName(feature); let hash = 17 + index;
  for (let i=0;i<name.length;i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
function validAt(feature, year) {
  const start = yearPart(feature?.properties?.start_date), end = yearPart(feature?.properties?.end_date);
  return (start === null || year >= start) && (end === null || year <= end);
}
function selectRussia(collection, year) {
  if (!collection?.features?.length) return [];
  const exact = collection.features.filter((f) => validAt(f, year));
  if (exact.length) return exact;
  const previous = collection.features.map((feature) => ({ feature, start: yearPart(feature.properties?.start_date) })).filter((x) => x.start !== null && x.start <= year).sort((a,b) => b.start-a.start);
  if (!previous.length) return [];
  return previous.filter((x) => x.start === previous[0].start).map((x) => x.feature);
}
function drawStar(ctx, x, y, outer, inner) {
  ctx.beginPath();
  for (let i=0;i<10;i++) {
    const a = -Math.PI/2 + i*Math.PI/5, r = i%2 ? inner : outer;
    const px = x + Math.cos(a)*r, py = y + Math.sin(a)*r;
    i ? ctx.lineTo(px,py) : ctx.moveTo(px,py);
  }
  ctx.closePath(); ctx.fill();
}
function latLonVector(lat, lon, distance) {
  const phi = lat * Math.PI / 180, lambda = lon * Math.PI / 180;
  return new THREE.Vector3(Math.cos(phi)*Math.cos(lambda), Math.sin(phi), -Math.cos(phi)*Math.sin(lambda)).multiplyScalar(distance);
}

function useHistoricalData(year, polityId) {
  const [index,setIndex] = useState(null), [manifest,setManifest] = useState(null), [world,setWorld] = useState(null), [worldYear,setWorldYear] = useState(null), [russia,setRussia] = useState(null);
  const worldCache = useRef(new Map()), russiaCache = useRef(new Map());
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '', c = new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`, {signal:c.signal}).then((r)=>r.json()),
      fetch(`${base}/data/territory/archive/manifest.json`, {signal:c.signal}).then((r)=>r.json())
    ]).then(([a,b]) => { if(!c.signal.aborted){ setIndex(a); setManifest(b); } }).catch(()=>{});
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!index?.snapshots?.length) return;
    const list = [...index.snapshots].sort((a,b)=>a.year-b.year), snap = [...list].reverse().find((s)=>s.year<=year) ?? list[0];
    const cached = worldCache.current.get(snap.file); if(cached){setWorld(cached);setWorldYear(snap.year);return;}
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '', c = new AbortController();
    fetch(`${base}/data/territory/world-history/${snap.file}`,{signal:c.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((data)=>{worldCache.current.set(snap.file,data);if(!c.signal.aborted){setWorld(data);setWorldYear(snap.year);}}).catch(()=>{});
    return()=>c.abort();
  },[index,year]);
  useEffect(() => {
    const entry = manifest?.polities?.find((p)=>p.polity_id===polityId && p.file && p.features>0); if(!entry?.file){setRussia(null);return;}
    const cached = russiaCache.current.get(entry.file); if(cached){setRussia(cached);return;}
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '', c = new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`,{signal:c.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((data)=>{russiaCache.current.set(entry.file,data);if(!c.signal.aborted)setRussia(data);}).catch(()=>{});
    return()=>c.abort();
  },[manifest,polityId]);
  return {index,world,worldYear,russia};
}

function buildHistoricalTexture(world, russiaFeatures, year, period, mobile) {
  const width = mobile ? TEXTURE_W_MOBILE : TEXTURE_W_DESKTOP, height = width/2;
  const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const ctx = canvas.getContext('2d');
  const projection = geoEquirectangular().translate([width/2,height/2]).scale(width/(2*Math.PI)).precision(.2);
  const path = geoPath(projection,ctx);
  const ocean = ctx.createLinearGradient(0,0,width,height); ocean.addColorStop(0,'#082733'); ocean.addColorStop(.5,'#061d27'); ocean.addColorStop(1,'#03141d');
  ctx.fillStyle=ocean;ctx.fillRect(0,0,width,height);
  ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(167,198,196,.18)';ctx.lineWidth=1;ctx.stroke();
  const accepted=[];
  (world?.features ?? []).forEach((feature,index)=>{
    ctx.beginPath(); path(feature); ctx.fillStyle=featureColor(feature,index); ctx.fill(); ctx.strokeStyle='rgba(229,219,191,.62)';ctx.lineWidth=.8;ctx.stroke();
    const area=geoArea(feature); if(area>.008){const c=geoCentroid(feature),p=projection(c),name=featureName(feature);if(p&&name)accepted.push({name:RU[name]??name,x:p[0],y:p[1],area});}
  });
  if(russiaFeatures.length){const c={type:'FeatureCollection',features:russiaFeatures};ctx.beginPath();path(c);ctx.fillStyle='#335b38';ctx.fill();ctx.strokeStyle='#edcf79';ctx.lineWidth=2.2;ctx.stroke();}
  // Land relief impression is provided by the WebGL normal map. The texture itself stays clean and historical.
  ctx.save();ctx.globalAlpha=.16;for(let y=9;y<height;y+=21){ctx.beginPath();for(let x=0;x<width;x+=28){const yy=y+Math.sin((x+y)*.012)*4;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy);}ctx.strokeStyle='#ead69c';ctx.lineWidth=.6;ctx.stroke();}ctx.restore();
  ctx.textAlign='center';ctx.textBaseline='middle';
  accepted.sort((a,b)=>b.area-a.area).slice(0,mobile?45:75).forEach((l)=>{const size=clamp(13+Math.sqrt(l.area)*38,14,29);ctx.font=`500 ${size}px Georgia, serif`;ctx.lineWidth=3.5;ctx.strokeStyle='rgba(3,11,15,.78)';ctx.strokeText(l.name,l.x,l.y);ctx.fillStyle='#eee7d2';ctx.fillText(l.name,l.x,l.y);});
  if(russiaFeatures.length){const c=geoCentroid({type:'FeatureCollection',features:russiaFeatures}),p=projection(c);if(p){ctx.font=`600 ${mobile?28:34}px Georgia, serif`;ctx.lineWidth=5;ctx.strokeStyle='rgba(3,11,15,.8)';ctx.strokeText(period.label,p[0],p[1]);ctx.fillStyle='#f0e5c8';ctx.fillText(period.label,p[0],p[1]);}}
  const places = TERRITORY_PLACES.filter((p)=>(p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year);
  ctx.textAlign='left';
  places.forEach((place)=>{const p=projection([place.lon,place.lat]);if(!p)return;const capital=place.kind==='capital';ctx.fillStyle=capital?'#f6dc91':'#f5ead0';if(capital)drawStar(ctx,p[0],p[1],6.2,2.7);else{ctx.beginPath();ctx.arc(p[0],p[1],2.4,0,TWO_PI);ctx.fill();}ctx.font=`${capital?600:500} ${capital?18:15}px Georgia, serif`;ctx.lineWidth=3;ctx.strokeStyle='rgba(3,11,15,.88)';ctx.strokeText(place.name,p[0]+(capital?9:6),p[1]+2);ctx.fillStyle='#f5ead0';ctx.fillText(place.name,p[0]+(capital?9:6),p[1]+2);});
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=4; texture.needsUpdate=true; return texture;
}

export function HistoricalTerritoryGlobeWebGL({initialYear=TERRITORY_MAX_YEAR}) {
  const hostRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),controlsRef=useRef(null),textureRef=useRef(null),materialRef=useRef(null),textureTimer=useRef(null),scrollFrame=useRef(null);
  const [year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);
  const period=territoryPeriodAt(year),{index,world,worldYear,russia}=useHistoricalData(year,period.polityId);
  const russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const snapshots=useMemo(()=>{const s=new Set(POLITY_TRANSITION_YEARS);for(const x of index?.snapshots??[])s.add(x.year);s.add(TERRITORY_MAX_YEAR);return [...s].filter((y)=>y>=TERRITORY_MIN_YEAR&&y<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  const ticks=useMemo(()=>{const out=[];for(let y=Math.ceil(TERRITORY_MIN_YEAR/10)*10;y<=TERRITORY_MAX_YEAR;y+=10)out.push(y);return out;},[]);

  useEffect(()=>{const q=matchMedia('(max-width: 720px)');const run=()=>setMobile(q.matches);run();q.addEventListener('change',run);return()=>q.removeEventListener('change',run);},[]);
  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(38,1,.1,100);camera.position.set(2.65,1.55,2.7);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);host.appendChild(renderer.domElement);
    const geometry=new THREE.SphereGeometry(1,96,64);const material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.83,metalness:.02});materialRef.current=material;const earth=new THREE.Mesh(geometry,material);scene.add(earth);
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';new THREE.TextureLoader().load(`${base}/data/territory/terrain/earth_normal_2048.jpg`,(normal)=>{normal.wrapS=THREE.RepeatWrapping;normal.colorSpace=THREE.NoColorSpace;material.normalMap=normal;material.normalScale.set(.58,.58);material.needsUpdate=true;});
    scene.add(new THREE.HemisphereLight(0xbfd9df,0x1d1811,1.35));const sun=new THREE.DirectionalLight(0xffe5b0,2.7);sun.position.set(-3,3,4);scene.add(sun);const fill=new THREE.DirectionalLight(0x6da2bb,.65);fill.position.set(4,-1,-3);scene.add(fill);
    const glowMat=new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,uniforms:{glowColor:{value:new THREE.Color(0x7bb0ba)}},vertexShader:'varying vec3 vNormal; void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vNormal; uniform vec3 glowColor; void main(){float i=pow(0.72-dot(vNormal,vec3(0.,0.,1.)),2.6);gl_FragColor=vec4(glowColor,i*.28);}'});scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.035,64,48),glowMat));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=false;controls.rotateSpeed=.72;controls.zoomSpeed=.9;controls.minDistance=1.28;controls.maxDistance=5.6;controls.target.set(0,0,0);controlsRef.current=controls;
    const resize=()=>{const r=host.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();};resize();const ro=new ResizeObserver(resize);ro.observe(host);
    let raf=0;const loop=()=>{controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(loop);};loop();sceneRef.current={scene,camera,renderer,earth,geometry,material,glowMat,ro,raf};
    return()=>{cancelAnimationFrame(raf);ro.disconnect();controls.dispose();geometry.dispose();material.dispose();glowMat.dispose();renderer.dispose();renderer.domElement.remove();sceneRef.current=null;controlsRef.current=null;};
  },[]);

  useEffect(()=>{if(!world||!materialRef.current)return;clearTimeout(textureTimer.current);textureTimer.current=setTimeout(()=>{const tex=buildHistoricalTexture(world,russiaFeatures,year,period,mobile);if(textureRef.current)textureRef.current.dispose();textureRef.current=tex;materialRef.current.map=tex;materialRef.current.needsUpdate=true;},110);return()=>clearTimeout(textureTimer.current);},[world,russiaFeatures,year,period.label,mobile]);

  const focusRussia=useCallback(()=>{const c=controlsRef.current, runtime=sceneRef.current;if(!c||!runtime)return;const [lon,lat]=period.focus;runtime.camera.position.copy(latLonVector(lat,lon,2.65));c.target.set(0,0,0);c.update();},[period.focus]);
  useEffect(()=>{focusRussia();},[period.polityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const h=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h);},[]);
  async function toggleFullscreen(){const el=hostRef.current?.closest(`.${styles.scene}`);if(!el)return;if(document.fullscreenElement)await document.exitFullscreen();else await el.requestFullscreen();}

  const scrollToYear=useCallback((next,behavior='smooth')=>{const el=timelineRef.current;if(!el)return;const y=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);const target=(y-TERRITORY_MIN_YEAR)*YEAR_PX;el.scrollTo({left:target,behavior});setYear(y);},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[]); // eslint-disable-line react-hooks/exhaustive-deps
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{const el=timelineRef.current;if(!el)return;setYear(clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));});}
  function jump(direction){const list=direction>0?snapshots.filter((y)=>y>year):snapshots.filter((y)=>y<year).reverse();if(list.length)scrollToYear(list[0]);}

  return <main className={styles.page}>
    <section className={styles.scene}>
      <div className={styles.space}/><div ref={hostRef} className={styles.globeHost}/>
      <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}><button className={styles.active}>Глобус</button><button onClick={focusRussia}>К России</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
      <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года</p></aside>
      <div className={styles.zoomTools}><button onClick={()=>{const c=controlsRef.current,r=sceneRef.current;if(c&&r){r.camera.position.multiplyScalar(.78);c.update();}}}>+</button><button onClick={()=>{const c=controlsRef.current,r=sceneRef.current;if(c&&r){r.camera.position.multiplyScalar(1.28);c.update();}}}>−</button><button onClick={focusRussia}>◎</button></div>
      <section className={styles.timeline}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Прокручивайте линию времени</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map((y)=><div key={y} className={`${styles.tick} ${y%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{y%50===0&&<span>{y}</span>}</div>)}{snapshots.map((y)=><i key={y} className={styles.eventTick} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
    </section>
  </main>;
}
