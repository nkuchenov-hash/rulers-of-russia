'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoEquirectangular, geoPath } from 'd3-geo';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { POLITY_TRANSITION_YEARS, TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR, territoryPeriodAt } from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-webgl.module.css';

const TWO_PI = Math.PI * 2;
const MAX_FEATURE_AREA = 2.2;
const YEAR_PX = 6;
const PALETTE = ['#59694f','#6b5b48','#4a6764','#72514c','#536b54','#60566d','#746d46','#4b6259','#6c5f4d','#435b67','#735c60'];
const TERRAIN_URL = 'https://www.inf.u-szeged.hu/~tanacs/threejs/examples/textures/planets/earth_day_4096.jpg';
const NORMAL_URL = 'https://www.inf.u-szeged.hu/~tanacs/threejs/examples/textures/planets/earth_normal_2048.jpg';

const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
const yearPart = (v) => { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; };
const reverseRing = (ring) => [...ring].reverse();

function normalizeFeature(feature){
  if(!feature?.geometry || !['Polygon','MultiPolygon'].includes(feature.geometry.type)) return null;
  let next = feature;
  if(geoArea(next) > TWO_PI){
    const geometry = feature.geometry.type === 'Polygon'
      ? {type:'Polygon',coordinates:feature.geometry.coordinates.map(reverseRing)}
      : {type:'MultiPolygon',coordinates:feature.geometry.coordinates.map((p)=>p.map(reverseRing))};
    next = {...feature,geometry};
  }
  const area = geoArea(next);
  return Number.isFinite(area) && area > 0 && area <= MAX_FEATURE_AREA ? next : null;
}
function normalizeCollection(collection){
  return {...collection,features:(collection?.features ?? []).map(normalizeFeature).filter(Boolean)};
}
function featureName(feature){
  const p = feature?.properties ?? {};
  return [p.ABBREVN,p.NAME,p.SUBJECTO,p.PARTOF,p.name,p.ADMIN,p.entity,p.polity].find((x)=>typeof x==='string' && x.trim())?.trim() ?? '';
}
function featureColor(feature,index){
  const name = featureName(feature);
  let hash = 17 + index;
  for(let i=0;i<name.length;i++) hash = ((hash<<5)-hash+name.charCodeAt(i))|0;
  return PALETTE[Math.abs(hash)%PALETTE.length];
}
function validAt(feature,year){
  const start = yearPart(feature?.properties?.start_date);
  const end = yearPart(feature?.properties?.end_date);
  return (start===null || year>=start) && (end===null || year<=end);
}
function selectRussia(collection,year){
  if(!collection?.features?.length) return [];
  const exact = collection.features.filter((f)=>validAt(f,year));
  if(exact.length) return exact;
  const previous = collection.features.map((feature)=>({feature,start:yearPart(feature.properties?.start_date)})).filter((x)=>x.start!==null && x.start<=year).sort((a,b)=>b.start-a.start);
  if(!previous.length) return [];
  return previous.filter((x)=>x.start===previous[0].start).map((x)=>x.feature);
}
function latLonVector(lat,lon,radius=1){
  const phi = lat*Math.PI/180;
  const lambda = lon*Math.PI/180;
  return new THREE.Vector3(Math.cos(phi)*Math.cos(lambda),Math.sin(phi),-Math.cos(phi)*Math.sin(lambda)).multiplyScalar(radius);
}
function ringCoordinates(feature){
  if(feature.geometry.type==='Polygon') return feature.geometry.coordinates;
  return feature.geometry.coordinates.flat();
}
function buildLineSegments(features,radius,color,opacity){
  const positions = [];
  for(const feature of features ?? []){
    for(const ring of ringCoordinates(feature)){
      if(!Array.isArray(ring) || ring.length<2) continue;
      const step = ring.length > 2400 ? 4 : ring.length > 1000 ? 2 : 1;
      for(let i=0;i<ring.length-1;i+=step){
        const a = ring[i], b = ring[Math.min(i+step,ring.length-1)];
        if(!a || !b) continue;
        const p1 = latLonVector(a[1],a[0],radius), p2 = latLonVector(b[1],b[0],radius);
        positions.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const material = new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false});
  const lines = new THREE.LineSegments(geometry,material);
  lines.renderOrder = 6;
  return lines;
}
function buildGraticule(){
  const positions=[];
  const add=(a,b)=>{const p1=latLonVector(a[1],a[0],1.006),p2=latLonVector(b[1],b[0],1.006);positions.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)};
  for(let lat=-80;lat<=80;lat+=10){for(let lon=-180;lon<180;lon+=4)add([lon,lat],[lon+4,lat]);}
  for(let lon=-180;lon<180;lon+=10){for(let lat=-88;lat<88;lat+=4)add([lon,lat],[lon,lat+4]);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const m=new THREE.LineBasicMaterial({color:0x89a4a6,transparent:true,opacity:.16,depthWrite:false});
  const lines=new THREE.LineSegments(g,m);lines.renderOrder=2;return lines;
}
function buildPoliticalTexture(world,russiaFeatures,width){
  const height=width/2,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  const projection=geoEquirectangular().translate([width/2,height/2]).scale(width/(2*Math.PI)).precision(.25);
  const path=geoPath(projection,ctx);
  ctx.clearRect(0,0,width,height);
  (world?.features ?? []).forEach((feature,index)=>{
    ctx.beginPath();path(feature);ctx.globalAlpha=.34;ctx.fillStyle=featureColor(feature,index);ctx.fill();
  });
  if(russiaFeatures.length){ctx.beginPath();path({type:'FeatureCollection',features:russiaFeatures});ctx.globalAlpha=.48;ctx.fillStyle='#315b38';ctx.fill();}
  ctx.globalAlpha=1;
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}
function makeCityLabel(place){
  const el=document.createElement('div');
  el.textContent=`${place.kind==='capital'?'★':'•'} ${place.name}`;
  el.style.cssText=[
    'white-space:nowrap','font-family:Georgia,serif','font-weight:600','font-size:15px','line-height:1',
    'color:#f2e8cf','text-shadow:0 1px 2px #02090c,0 0 2px #02090c,1px 0 #02090c,-1px 0 #02090c',
    'transform:translate(8px,-50%)','pointer-events:none','user-select:none','will-change:transform,opacity'
  ].join(';');
  if(place.kind==='capital') el.style.color='#f0d58f';
  const object=new CSS2DObject(el);
  object.position.copy(latLonVector(place.lat,place.lon,1.03));
  object.userData={place};
  return object;
}
function disposeGroup(group){
  if(!group) return;
  group.traverse((object)=>{
    object.geometry?.dispose?.();
    if(object.material){const mats=Array.isArray(object.material)?object.material:[object.material];mats.forEach((m)=>m.dispose?.());}
  });
  group.clear();
}
function useHistoricalData(year,polityId){
  const [index,setIndex]=useState(null),[manifest,setManifest]=useState(null),[world,setWorld]=useState(null),[worldYear,setWorldYear]=useState(null),[russia,setRussia]=useState(null);
  const worldCache=useRef(new Map()),russiaCache=useRef(new Map());
  useEffect(()=>{const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();Promise.all([
    fetch(`${base}/data/territory/world-history/index.json`,{signal:controller.signal}).then((r)=>r.json()),
    fetch(`${base}/data/territory/archive/manifest.json`,{signal:controller.signal}).then((r)=>r.json())
  ]).then(([a,b])=>{if(!controller.signal.aborted){setIndex(a);setManifest(b);}}).catch(()=>{});return()=>controller.abort();},[]);
  useEffect(()=>{if(!index?.snapshots?.length)return;const list=[...index.snapshots].sort((a,b)=>a.year-b.year),snapshot=[...list].reverse().find((s)=>s.year<=year)??list[0];const cached=worldCache.current.get(snapshot.file);if(cached){setWorld(cached);setWorldYear(snapshot.year);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();fetch(`${base}/data/territory/world-history/${snapshot.file}`,{signal:controller.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((data)=>{worldCache.current.set(snapshot.file,data);if(!controller.signal.aborted){setWorld(data);setWorldYear(snapshot.year);}}).catch(()=>{});return()=>controller.abort();},[index,year]);
  useEffect(()=>{const entry=manifest?.polities?.find((p)=>p.polity_id===polityId&&p.file&&p.features>0);if(!entry?.file){setRussia(null);return;}const cached=russiaCache.current.get(entry.file);if(cached){setRussia(cached);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();fetch(`${base}/data/territory/archive/${entry.file}`,{signal:controller.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((data)=>{russiaCache.current.set(entry.file,data);if(!controller.signal.aborted)setRussia(data);}).catch(()=>{});return()=>controller.abort();},[manifest,polityId]);
  return {index,world,worldYear,russia};
}

export function HistoricalTerritoryGlobeWebGLV4({initialYear=TERRITORY_MAX_YEAR}){
  const hostRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),controlsRef=useRef(null),overlayTextureRef=useRef(null),overlayMaterialRef=useRef(null),borderGroupRef=useRef(null),cityGroupRef=useRef(null),labelRendererRef=useRef(null),scrollFrame=useRef(null),timerRef=useRef(null);
  const [year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);
  const period=territoryPeriodAt(year);
  const {index,world,worldYear,russia}=useHistoricalData(year,period.polityId);
  const russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const snapshots=useMemo(()=>{const s=new Set(POLITY_TRANSITION_YEARS);for(const x of index?.snapshots??[])s.add(x.year);s.add(TERRITORY_MAX_YEAR);return[...s].filter((y)=>y>=TERRITORY_MIN_YEAR&&y<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  const ticks=useMemo(()=>{const out=[];for(let y=Math.ceil(TERRITORY_MIN_YEAR/10)*10;y<=TERRITORY_MAX_YEAR;y+=10)out.push(y);return out;},[]);
  useEffect(()=>{const q=matchMedia('(max-width:720px)'),run=()=>setMobile(q.matches);run();q.addEventListener('change',run);return()=>q.removeEventListener('change',run);},[]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const compact=innerWidth<=720,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(compact?42:36,1,.05,100);
    camera.position.set(4.8,2.6,4.8);
    const renderer=new THREE.WebGLRenderer({antialias:!compact,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.25:1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);host.appendChild(renderer.domElement);
    const labelRenderer=new CSS2DRenderer();labelRenderer.domElement.style.position='absolute';labelRenderer.domElement.style.inset='0';labelRenderer.domElement.style.pointerEvents='none';labelRenderer.domElement.style.overflow='hidden';host.appendChild(labelRenderer.domElement);labelRendererRef.current=labelRenderer;
    const geometry=new THREE.SphereGeometry(1,compact?96:128,compact?64:96);
    const baseMaterial=new THREE.MeshStandardMaterial({color:0x60705e,roughness:.92,metalness:0});
    const earth=new THREE.Mesh(geometry,baseMaterial);earth.renderOrder=0;scene.add(earth);
    const overlayMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.9,depthWrite:false});overlayMaterialRef.current=overlayMaterial;
    const overlay=new THREE.Mesh(new THREE.SphereGeometry(1.004,compact?96:128,compact?64:96),overlayMaterial);overlay.renderOrder=3;scene.add(overlay);
    const loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
    loader.load(TERRAIN_URL,(texture)=>{texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=true;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());baseMaterial.map=texture;baseMaterial.needsUpdate=true;},undefined,()=>{});
    loader.load(NORMAL_URL,(normal)=>{normal.colorSpace=THREE.NoColorSpace;normal.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());baseMaterial.normalMap=normal;baseMaterial.normalScale.set(.58,.58);baseMaterial.needsUpdate=true;},undefined,()=>{});
    scene.add(new THREE.HemisphereLight(0xcbd8d1,0x181511,1.1));const sun=new THREE.DirectionalLight(0xffdf9f,2.35);sun.position.set(-3,3,4);scene.add(sun);const fill=new THREE.DirectionalLight(0x678fa0,.42);fill.position.set(4,-1,-3);scene.add(fill);
    scene.add(buildGraticule());
    const borderGroup=new THREE.Group();scene.add(borderGroup);borderGroupRef.current=borderGroup;
    const cityGroup=new THREE.Group();scene.add(cityGroup);cityGroupRef.current=cityGroup;
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.055;controls.enablePan=false;controls.rotateSpeed=.72;controls.zoomSpeed=.9;controls.minDistance=1.16;controls.maxDistance=8;controls.target.set(0,0,0);controlsRef.current=controls;
    const resize=()=>{const rect=host.getBoundingClientRect();const w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);labelRenderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};resize();const observer=new ResizeObserver(resize);observer.observe(host);
    let raf=0;const camDir=new THREE.Vector3();const objDir=new THREE.Vector3();
    const loop=()=>{controls.update();const distance=camera.position.length();camDir.copy(camera.position).normalize();cityGroup.children.forEach((obj)=>{const place=obj.userData.place;objDir.copy(obj.position).normalize();const front=objDir.dot(camDir)>.12;const zoomVisible=place.kind==='capital'?distance<4.25:distance<2.55;obj.element.style.display=front&&zoomVisible?'block':'none';obj.element.style.opacity=distance<1.75?'1':distance<2.55?'.94':'.88';obj.element.style.fontSize=distance<1.6?(place.kind==='capital'?'17px':'15px'):(place.kind==='capital'?'15px':'13px');});renderer.render(scene,camera);labelRenderer.render(scene,camera);raf=requestAnimationFrame(loop);};loop();
    sceneRef.current={scene,camera,renderer,geometry,baseMaterial,overlayMaterial,observer,raf};
    return()=>{cancelAnimationFrame(raf);observer.disconnect();controls.dispose();disposeGroup(borderGroup);cityGroup.children.forEach((o)=>o.element.remove());cityGroup.clear();geometry.dispose();baseMaterial.map?.dispose?.();baseMaterial.normalMap?.dispose?.();baseMaterial.dispose();overlay.geometry.dispose();overlayMaterial.map?.dispose?.();overlayMaterial.dispose();renderer.dispose();renderer.domElement.remove();labelRenderer.domElement.remove();sceneRef.current=null;controlsRef.current=null;};
  },[]);

  useEffect(()=>{
    const group=cityGroupRef.current;if(!group)return;
    group.children.forEach((o)=>o.element.remove());group.clear();
    TERRITORY_PLACES.filter((p)=>(p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year).forEach((place)=>group.add(makeCityLabel(place)));
  },[year]);

  useEffect(()=>{
    if(!world||!overlayMaterialRef.current)return;
    clearTimeout(timerRef.current);
    timerRef.current=setTimeout(()=>{
      const width=mobile?2048:3072,texture=buildPoliticalTexture(world,russiaFeatures,width);overlayTextureRef.current?.dispose();overlayTextureRef.current=texture;texture.anisotropy=4;overlayMaterialRef.current.map=texture;overlayMaterialRef.current.needsUpdate=true;
      const group=borderGroupRef.current;if(group){disposeGroup(group);group.add(buildLineSegments(world.features,1.010,0xc9c3ad,.62));if(russiaFeatures.length)group.add(buildLineSegments(russiaFeatures,1.014,0xe8c765,.98));}
    },120);
    return()=>clearTimeout(timerRef.current);
  },[world,russiaFeatures,mobile]);

  const focusRussia=useCallback(()=>{const controls=controlsRef.current,runtime=sceneRef.current;if(!controls||!runtime)return;const [lon,lat]=period.focus;runtime.camera.position.copy(latLonVector(lat,lon,mobile?4.9:4.1));controls.target.set(0,0,0);controls.update();},[period.focus,mobile]);
  useEffect(()=>{focusRussia();},[period.polityId,mobile]);
  useEffect(()=>{const handler=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',handler);return()=>document.removeEventListener('fullscreenchange',handler);},[]);
  async function toggleFullscreen(){const el=hostRef.current?.closest(`.${styles.scene}`);if(!el)return;if(document.fullscreenElement)await document.exitFullscreen();else await el.requestFullscreen();}
  const scrollToYear=useCallback((next,behavior='smooth')=>{const el=timelineRef.current;if(!el)return;const y=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);el.scrollTo({left:(y-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(y);},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[]);
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{const el=timelineRef.current;if(el)setYear(clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));});}
  function jump(direction){const list=direction>0?snapshots.filter((y)=>y>year):snapshots.filter((y)=>y<year).reverse();if(list.length)scrollToYear(list[0]);}
  function zoom(factor){const controls=controlsRef.current,runtime=sceneRef.current;if(!controls||!runtime)return;const v=runtime.camera.position.clone().multiplyScalar(factor);v.setLength(clamp(v.length(),1.16,8));runtime.camera.position.copy(v);controls.update();}

  return <main className={styles.page}><section className={styles.scene}><div className={styles.space}/><div ref={hostRef} className={styles.globeHost}/>
    <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}><button className={styles.active}>Глобус</button><button onClick={focusRussia}>К России</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
    <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года</p></aside>
    <div className={styles.zoomTools}><button onClick={()=>zoom(.8)}>+</button><button onClick={()=>zoom(1.25)}>−</button><button onClick={focusRussia}>◎</button></div>
    <section className={styles.timeline}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Прокручивайте линию времени</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map((y)=><div key={y} className={`${styles.tick} ${y%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{y%50===0&&<span>{y}</span>}</div>)}{snapshots.map((y)=><i key={y} className={styles.eventTick} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
  </section></main>;
}
