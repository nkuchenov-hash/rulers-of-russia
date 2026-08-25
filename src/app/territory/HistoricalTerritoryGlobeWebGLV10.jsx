'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {geoArea,geoEquirectangular,geoNaturalEarth1,geoPath} from 'd3-geo';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {CSS2DObject,CSS2DRenderer} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {POLITY_TRANSITION_YEARS,TERRITORY_MAX_YEAR,TERRITORY_MIN_YEAR,territoryPeriodAt} from './territoryChronology';
import {TERRITORY_PLACES} from './territoryPlaces';
import styles from './territory-webgl.module.css';

const TWO_PI=Math.PI*2;
const MAX_FEATURE_AREA=2.2;
const YEAR_PX=6;
const COUNTRY_PALETTE=['#9a5f55','#7f8e5e','#6f7fa4','#b3874f','#568490','#8e6f4d','#638a70','#956371','#76679a','#6f8d89','#a26e4e','#728c56','#8c6f96','#a17f5a'];
const RIVER_COLORS=[0x759aa5,0x829fa7,0x8da4a8];

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const yearPart=v=>{const m=String(v??'').match(/-?\d{3,4}/);return m?Number(m[0]):null};
const reverseRing=r=>[...r].reverse();
function normalizeFeature(f){
  if(!f?.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type))return null;
  let n=f;
  if(geoArea(n)>TWO_PI){
    const g=f.geometry.type==='Polygon'
      ?{type:'Polygon',coordinates:f.geometry.coordinates.map(reverseRing)}
      :{type:'MultiPolygon',coordinates:f.geometry.coordinates.map(p=>p.map(reverseRing))};
    n={...f,geometry:g};
  }
  const a=geoArea(n);
  return Number.isFinite(a)&&a>0&&a<=MAX_FEATURE_AREA?n:null;
}
function normalizeCollection(c){return{...c,features:(c?.features??[]).map(normalizeFeature).filter(Boolean)}}
function featureName(f){const p=f?.properties??{};return[p.ABBREVN,p.NAME,p.SUBJECTO,p.PARTOF,p.name,p.ADMIN,p.entity,p.polity].find(x=>typeof x==='string'&&x.trim())?.trim()??''}
function countryColor(f,i=0){
  const name=featureName(f);let h=23+i*17;
  for(let k=0;k<name.length;k++)h=((h<<5)-h+name.charCodeAt(k))|0;
  return COUNTRY_PALETTE[Math.abs(h)%COUNTRY_PALETTE.length];
}
function validAt(f,y){const s=yearPart(f?.properties?.start_date),e=yearPart(f?.properties?.end_date);return(s===null||y>=s)&&(e===null||y<=e)}
function selectRussia(c,y){
  if(!c?.features?.length)return[];
  const exact=c.features.filter(f=>validAt(f,y));
  if(exact.length)return exact;
  const prev=c.features.map(feature=>({feature,start:yearPart(feature.properties?.start_date)})).filter(x=>x.start!==null&&x.start<=y).sort((a,b)=>b.start-a.start);
  return prev.length?prev.filter(x=>x.start===prev[0].start).map(x=>x.feature):[];
}
function latLonVector(lat,lon,r=1){
  const p=lat*Math.PI/180,l=lon*Math.PI/180;
  return new THREE.Vector3(Math.cos(p)*Math.cos(l),Math.sin(p),-Math.cos(p)*Math.sin(l)).multiplyScalar(r);
}
function polygonRings(f){return f.geometry.type==='Polygon'?f.geometry.coordinates:f.geometry.coordinates.flat()}
function lineStrings(f){
  if(!f?.geometry)return[];
  if(f.geometry.type==='LineString')return[f.geometry.coordinates];
  if(f.geometry.type==='MultiLineString')return f.geometry.coordinates;
  return[];
}
function buildPolygonSegments(features,radius=1.0105){
  const pos=[];
  for(const f of features??[])for(const ring of polygonRings(f)){
    if(!Array.isArray(ring)||ring.length<2)continue;
    const step=ring.length>2600?4:ring.length>1200?2:1;
    for(let i=0;i<ring.length-1;i+=step){
      const a=ring[i],b=ring[Math.min(i+step,ring.length-1)];if(!a||!b)continue;
      const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);
      pos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
    }
  }
  return pos;
}
function riverTier(f){
  const rank=Number(f?.properties?.scalerank);
  if(Number.isFinite(rank)&&rank<=4)return 0;
  if(Number.isFinite(rank)&&rank<=6)return 1;
  return 2;
}
function buildRiverBuckets(collection,radius=1.012){
  const buckets=[[],[],[]];
  for(const f of collection?.features??[]){
    const tier=riverTier(f),target=buckets[tier];
    for(const line of lineStrings(f)){
      if(!Array.isArray(line)||line.length<2)continue;
      const step=line.length>1800?3:line.length>700?2:1;
      for(let i=0;i<line.length-1;i+=step){
        const a=line[i],b=line[Math.min(i+step,line.length-1)];if(!a||!b)continue;
        const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);
        target.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
      }
    }
  }
  return buckets;
}
function makeWideLines(positions,color,linewidth,opacity,tier=null){
  const g=new LineSegmentsGeometry();g.setPositions(positions);
  const m=new LineMaterial({color,linewidth,transparent:true,opacity,depthWrite:false,depthTest:true});
  const line=new LineSegments2(g,m);line.computeLineDistances();line.userData.tier=tier;
  return{line,material:m,geometry:g};
}
function buildStateTexture(world,russiaFeatures,width=2048){
  const height=width/2,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),projection=geoEquirectangular().translate([width/2,height/2]).scale(width/(2*Math.PI)).precision(.35),path=geoPath(projection,ctx);
  ctx.clearRect(0,0,width,height);
  (world?.features??[]).forEach((f,i)=>{ctx.beginPath();path(f);ctx.globalAlpha=.86;ctx.fillStyle=countryColor(f,i);ctx.fill()});
  if(russiaFeatures.length){ctx.beginPath();path({type:'FeatureCollection',features:russiaFeatures});ctx.globalAlpha=.94;ctx.fillStyle='#78905f';ctx.fill()}
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;
  return t;
}
function makeLabel(place){
  const el=document.createElement('div');
  el.textContent=`${place.kind==='capital'?'★':'•'} ${place.name}`;
  el.style.cssText='display:none;white-space:nowrap;font:600 14px Georgia,serif;color:#eee8d8;text-shadow:0 1px 2px #080b0b,0 0 3px #080b0b;transform:translate(8px,-50%);pointer-events:none;user-select:none';
  if(place.kind==='capital')el.style.color='#ded1aa';
  const obj=new CSS2DObject(el);obj.position.copy(latLonVector(place.lat,place.lon,1.019));obj.userData={place};return obj;
}
function useHistoricalData(year,polityId){
  const[index,setIndex]=useState(null),[manifest,setManifest]=useState(null),[world,setWorld]=useState(null),[worldYear,setWorldYear]=useState(null),[russia,setRussia]=useState(null),[rivers,setRivers]=useState(null);
  const wc=useRef(new Map),rc=useRef(new Map);
  useEffect(()=>{
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`,{signal:c.signal}).then(r=>r.json()),
      fetch(`${base}/data/territory/archive/manifest.json`,{signal:c.signal}).then(r=>r.json()),
      fetch(`${base}/data/territory/hydro/rivers_50m.geojson`,{signal:c.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]).then(([a,b,rv])=>{if(!c.signal.aborted){setIndex(a);setManifest(b);setRivers(rv)}}).catch(()=>{});
    return()=>c.abort();
  },[]);
  useEffect(()=>{
    if(!index?.snapshots?.length)return;
    const list=[...index.snapshots].sort((a,b)=>a.year-b.year),snap=[...list].reverse().find(s=>s.year<=year)??list[0],cached=wc.current.get(snap.file);
    if(cached){setWorld(cached);setWorldYear(snap.year);return}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();
    fetch(`${base}/data/territory/world-history/${snap.file}`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{wc.current.set(snap.file,d);if(!c.signal.aborted){setWorld(d);setWorldYear(snap.year)}}).catch(()=>{});
    return()=>c.abort();
  },[index,year]);
  useEffect(()=>{
    const e=manifest?.polities?.find(p=>p.polity_id===polityId&&p.file&&p.features>0);
    if(!e?.file){setRussia(null);return}
    const cached=rc.current.get(e.file);if(cached){setRussia(cached);return}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();
    fetch(`${base}/data/territory/archive/${e.file}`,{signal:c.signal,cache:'force-cache'}).then(r=>r.json()).then(normalizeCollection).then(d=>{rc.current.set(e.file,d);if(!c.signal.aborted)setRussia(d)}).catch(()=>{});
    return()=>c.abort();
  },[manifest,polityId]);
  return{index,world,worldYear,russia,rivers};
}

export function HistoricalTerritoryGlobeWebGLV10({initialYear=TERRITORY_MAX_YEAR}){
  const hostRef=useRef(null),mapRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),renderRef=useRef(()=>{}),modeRef=useRef('relief'),stateTextureRef=useRef(null),borderRef=useRef(null),riverRef=useRef(null),citiesRef=useRef(null),scrollFrame=useRef(null);
  const[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[mode,setMode]=useState('relief'),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);
  const period=territoryPeriodAt(year),{index,world,worldYear,russia,rivers}=useHistoricalData(year,period.polityId),russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const snapshots=useMemo(()=>{const s=new Set(POLITY_TRANSITION_YEARS);for(const x of index?.snapshots??[])s.add(x.year);s.add(TERRITORY_MAX_YEAR);return[...s].filter(y=>y>=TERRITORY_MIN_YEAR&&y<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b)},[index]);
  const ticks=useMemo(()=>{const out=[];for(let y=Math.ceil(TERRITORY_MIN_YEAR/10)*10;y<=TERRITORY_MAX_YEAR;y+=10)out.push(y);return out},[]);

  useEffect(()=>{const q=matchMedia('(max-width:720px)'),run=()=>setMobile(q.matches);run();q.addEventListener('change',run);return()=>q.removeEventListener('change',run)},[]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    const compact=window.innerWidth<=720,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(compact?40:34,1,.005,100);
    camera.position.set(2.1,1.16,2.02);
    const renderer=new THREE.WebGLRenderer({antialias:!compact,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.1:1.35));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x050a0c,1);host.appendChild(renderer.domElement);
    const labels=new CSS2DRenderer();labels.domElement.style.position='absolute';labels.domElement.style.inset='0';labels.domElement.style.pointerEvents='none';labels.domElement.style.overflow='hidden';host.appendChild(labels.domElement);
    const geometry=new THREE.SphereGeometry(1,compact?80:128,compact?56:88),baseMaterial=new THREE.MeshStandardMaterial({color:0xbcb8ad,roughness:.93,metalness:0}),globe=new THREE.Mesh(geometry,baseMaterial);scene.add(globe);
    const overlayMaterial=new THREE.MeshBasicMaterial({transparent:true,opacity:.88,depthWrite:false}),overlayGeometry=new THREE.SphereGeometry(1.003,compact?80:128,compact?56:88),overlay=new THREE.Mesh(overlayGeometry,overlayMaterial);overlay.renderOrder=3;scene.add(overlay);overlay.visible=false;
    const loader=new THREE.TextureLoader(),base=process.env.NEXT_PUBLIC_BASE_PATH??'';
    loader.load(`${base}/data/territory/terrain/earth_surface_2048.jpg`,t=>{t.colorSpace=THREE.SRGBColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());baseMaterial.color.set(0xd2cec3);baseMaterial.map=t;baseMaterial.needsUpdate=true;renderRef.current()});
    loader.load(`${base}/data/territory/terrain/earth_normal_2048.jpg`,n=>{n.colorSpace=THREE.NoColorSpace;n.minFilter=THREE.LinearMipmapLinearFilter;n.magFilter=THREE.LinearFilter;n.generateMipmaps=true;n.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());baseMaterial.normalMap=n;baseMaterial.normalScale.set(1.75,1.75);baseMaterial.needsUpdate=true;renderRef.current()});
    scene.add(new THREE.HemisphereLight(0xcfd2cc,0x10100d,.72));const sun=new THREE.DirectionalLight(0xffefd4,2.4);sun.position.set(-4.8,2.8,3.5);scene.add(sun);const rim=new THREE.DirectionalLight(0x78939b,.42);rim.position.set(4.2,-.7,-3.2);scene.add(rim);
    const borderGroup=new THREE.Group(),riverGroup=new THREE.Group(),cityGroup=new THREE.Group();scene.add(borderGroup);scene.add(riverGroup);scene.add(cityGroup);borderRef.current=borderGroup;riverRef.current=riverGroup;citiesRef.current=cityGroup;
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.enablePan=false;controls.rotateSpeed=.7;controls.zoomSpeed=.82;controls.minDistance=1.03;controls.maxDistance=7;
    const camDir=new THREE.Vector3(),objDir=new THREE.Vector3();
    const updateDynamic=()=>{
      const d=camera.position.length();camDir.copy(camera.position).normalize();
      for(const obj of cityGroup.children){const p=obj.userData.place;objDir.copy(obj.position).normalize();const front=objDir.dot(camDir)>.58;const near=p.kind==='capital'?d<1.46:d<1.18;obj.element.style.display=front&&near?'block':'none'}
      for(const line of riverGroup.children){const tier=line.userData.tier;line.visible=tier===0||(tier===1&&d<2.6)||(tier===2&&d<1.72)}
    };
    const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};renderRef.current=render;controls.addEventListener('change',render);
    const resize=()=>{const r=host.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);renderer.setSize(w,h,false);labels.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();borderGroup.children.forEach(x=>x.material?.resolution?.set?.(w,h));riverGroup.children.forEach(x=>x.material?.resolution?.set?.(w,h));render()};resize();const ro=new ResizeObserver(resize);ro.observe(host);
    sceneRef.current={scene,camera,renderer,labels,geometry,baseMaterial,overlay,overlayGeometry,overlayMaterial,controls,resize,ro};render();
    return()=>{ro.disconnect();controls.removeEventListener('change',render);controls.dispose();borderGroup.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});riverGroup.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});cityGroup.children.forEach(o=>o.element?.remove?.());geometry.dispose();overlayGeometry.dispose();baseMaterial.map?.dispose?.();baseMaterial.normalMap?.dispose?.();baseMaterial.dispose();overlayMaterial.dispose();renderer.dispose();renderer.domElement.remove();labels.domElement.remove();sceneRef.current=null};
  },[]);

  useEffect(()=>{
    const group=riverRef.current;if(!group||!rivers)return;group.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});group.clear();
    const buckets=buildRiverBuckets(rivers),widths=mobile?[1.7,1.05,.62]:[2.25,1.35,.78],opacity=[.86,.72,.56];
    buckets.forEach((pos,tier)=>{if(!pos.length)return;const built=makeWideLines(pos,RIVER_COLORS[tier],widths[tier],opacity[tier],tier);built.line.renderOrder=5;group.add(built.line)});
    const box=hostRef.current?.getBoundingClientRect();if(box)group.children.forEach(x=>x.material?.resolution?.set?.(box.width,box.height));renderRef.current();
  },[rivers,mobile]);

  useEffect(()=>{
    const group=borderRef.current;if(!group)return;
    if(!['borders','states'].includes(mode)||!world){group.visible=false;renderRef.current();return}
    group.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()});group.clear();
    const all=buildPolygonSegments(world.features);if(all.length){const built=makeWideLines(all,0xd6d0c0,mobile?1.55:2.15,.88);built.line.renderOrder=6;group.add(built.line)}
    const ru=buildPolygonSegments(russiaFeatures,1.013);if(ru.length){const built=makeWideLines(ru,0xe0c06f,mobile?2.25:3.05,.98);built.line.renderOrder=7;group.add(built.line)}
    const box=hostRef.current?.getBoundingClientRect();if(box)group.children.forEach(x=>x.material?.resolution?.set?.(box.width,box.height));group.visible=true;renderRef.current();
  },[mode,world,russiaFeatures,mobile]);

  useEffect(()=>{
    const group=citiesRef.current;if(!group)return;group.children.forEach(o=>o.element?.remove?.());group.clear();for(const p of TERRITORY_PLACES){if((p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year)group.add(makeLabel(p))}renderRef.current();
  },[year]);

  useEffect(()=>{
    const r=sceneRef.current;if(!r||mode!=='states'||!world)return;stateTextureRef.current?.dispose?.();const tex=buildStateTexture(world,russiaFeatures,mobile?1536:2048);stateTextureRef.current=tex;r.overlayMaterial.map=tex;r.overlayMaterial.needsUpdate=true;renderRef.current();
  },[mode,world,russiaFeatures,mobile]);

  useEffect(()=>{
    modeRef.current=mode;const r=sceneRef.current;if(!r)return;r.overlay.visible=mode==='states';if(borderRef.current)borderRef.current.visible=mode==='borders'||mode==='states';if(riverRef.current)riverRef.current.visible=true;
    r.renderer.domElement.style.transition='filter .2s ease';r.renderer.domElement.style.filter=mode==='states'?'saturate(.82) contrast(1.08) brightness(.88)':'grayscale(1) sepia(.10) saturate(.34) contrast(1.17) brightness(.80)';
    if(mode!=='map')requestAnimationFrame(()=>r.resize());renderRef.current();
  },[mode]);

  const drawFlatMap=useCallback(()=>{
    if(mode!=='map'||!mapRef.current||!world)return;const canvas=mapRef.current,rect=canvas.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));if(w<4||h<4)return;
    const dpr=Math.min(devicePixelRatio||1,mobile?1.15:1.4);canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const sphere={type:'Sphere'},projection=geoNaturalEarth1().fitExtent([[28,24],[w-28,h-24]],sphere),path=geoPath(projection,ctx);ctx.fillStyle='#111615';ctx.fillRect(0,0,w,h);ctx.beginPath();path(sphere);ctx.fillStyle='#202624';ctx.fill();
    world.features.forEach((f,i)=>{ctx.beginPath();path(f);ctx.fillStyle=countryColor(f,i);ctx.globalAlpha=.83;ctx.fill();ctx.globalAlpha=1;ctx.strokeStyle='rgba(224,218,201,.86)';ctx.lineWidth=1.15;ctx.stroke()});
    if(russiaFeatures.length){ctx.beginPath();path({type:'FeatureCollection',features:russiaFeatures});ctx.fillStyle='rgba(120,144,95,.92)';ctx.fill();ctx.strokeStyle='rgba(232,200,112,.98)';ctx.lineWidth=2.1;ctx.stroke()}
    if(rivers){for(const f of rivers.features??[]){const rank=Number(f?.properties?.scalerank),tier=Number.isFinite(rank)&&rank<=4?0:Number.isFinite(rank)&&rank<=6?1:2;ctx.beginPath();path(f);ctx.strokeStyle=tier===0?'rgba(117,154,165,.92)':tier===1?'rgba(130,159,167,.78)':'rgba(141,164,168,.58)';ctx.lineWidth=tier===0?1.55:tier===1?.95:.5;ctx.stroke()}}
  },[mode,world,russiaFeatures,rivers,mobile]);
  useEffect(()=>{if(mode!=='map')return;let frame=requestAnimationFrame(drawFlatMap);const ro=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(drawFlatMap)}),canvas=mapRef.current;if(canvas)ro.observe(canvas);return()=>{cancelAnimationFrame(frame);ro.disconnect()}},[drawFlatMap,mode]);

  const focusRussia=useCallback(()=>{const r=sceneRef.current;if(!r)return;const[lon,lat]=period.focus;r.camera.position.copy(latLonVector(lat,lon,mobile?2.95:2.62));r.controls.target.set(0,0,0);r.controls.update();renderRef.current()},[period.focus,mobile]);
  useEffect(()=>{if(mode!=='map')focusRussia()},[period.polityId,mobile]);
  useEffect(()=>{const h=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h)},[]);
  async function toggleFullscreen(){const el=hostRef.current?.closest(`.${styles.scene}`);if(!el)return;document.fullscreenElement?await document.exitFullscreen():await el.requestFullscreen()}
  function zoom(f){const r=sceneRef.current;if(!r||mode==='map')return;const v=r.camera.position.clone();v.setLength(clamp(v.length()*f,1.03,7));r.camera.position.copy(v);r.controls.update();renderRef.current()}
  const scrollToYear=useCallback((next,behavior='smooth')=>{const el=timelineRef.current;if(!el)return;const y=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);el.scrollTo({left:(y-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(y)},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'))},[]);
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{const el=timelineRef.current;if(el)setYear(clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR))})}
  function jump(dir){const list=dir>0?snapshots.filter(y=>y>year):snapshots.filter(y=>y<year).reverse();if(list.length)scrollToYear(list[0])}

  return <main className={styles.page}><section className={styles.scene}>
    <div className={styles.space}/>
    <div ref={hostRef} className={styles.globeHost} style={{display:mode==='map'?'none':'block'}}/>
    <canvas ref={mapRef} className={styles.globeHost} style={{display:mode==='map'?'block':'none',width:'100%',height:'100%',zIndex:2}}/>
    <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}>
      <button className={mode==='relief'?styles.active:''} onClick={()=>setMode('relief')}>Рельеф</button><button className={mode==='borders'?styles.active:''} onClick={()=>setMode('borders')}>Границы</button><button className={mode==='states'?styles.active:''} onClick={()=>setMode('states')}>Государства</button><button className={mode==='map'?styles.active:''} onClick={()=>setMode('map')}>Карта</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button>
    </div></header>
    <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года · физический рельеф и реальная гидрография Natural Earth</p></aside>
    {mode!=='map'&&<div className={styles.zoomTools}><button onClick={()=>zoom(.78)}>+</button><button onClick={()=>zoom(1.28)}>−</button><button onClick={focusRussia}>◎</button></div>}
    <section className={styles.timeline}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Прокручивайте линию времени</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map(y=><i key={y} className={`${styles.tick} ${y%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{y%50===0?<span>{y}</span>:null}</i>)}{POLITY_TRANSITION_YEARS.map(y=><i key={`e-${y}`} className={styles.eventTick} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
  </section></main>;
}
