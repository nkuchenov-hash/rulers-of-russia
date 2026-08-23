'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { POLITY_TRANSITION_YEARS, TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR, territoryPeriodAt } from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-webgl.module.css';

const graticule = geoGraticule10();
const TWO_PI = Math.PI * 2;
const MAX_FEATURE_AREA = 2.2;
const YEAR_PX = 6;
const MAJOR_RUSSIAN_CITIES = new Set(['Москва','Санкт-Петербург','Казань','Нижний Новгород','Самара','Екатеринбург','Новосибирск','Омск','Красноярск','Ростов-на-Дону','Волгоград','Архангельск','Мурманск','Владивосток','Хабаровск','Иркутск','Тобольск','Астрахань']);
const PALETTE = ['#59694f','#6b5b48','#4a6764','#72514c','#536b54','#60566d','#746d46','#4b6259','#6c5f4d','#435b67','#735c60'];
const RU = {Russia:'Россия',US:'США',USA:'США',Canada:'Канада',Greenland:'Гренландия',Iceland:'Исландия',Norway:'Норвегия',Sweden:'Швеция',Finland:'Финляндия',Denmark:'Дания',Poland:'Польша',Germany:'Германия',France:'Франция',Italy:'Италия',Spain:'Испания',Portugal:'Португалия',UK:'Великобритания',Ireland:'Ирландия',Belarus:'Беларусь',Ukraine:'Украина',Lithuania:'Литва',Latvia:'Латвия',Estonia:'Эстония',Georgia:'Грузия',Armenia:'Армения',Azerbaijan:'Азербайджан',Kazakhstan:'Казахстан',China:'Китай',Mongolia:'Монголия',India:'Индия',Pakistan:'Пакистан',Afghanistan:'Афганистан',Iran:'Иран',Iraq:'Ирак',Turkey:'Турция',Syria:'Сирия',Egypt:'Египет',Japan:'Япония',Korea:'Корея',Greece:'Греция',Austria:'Австрия',Hungary:'Венгрия',Romania:'Румыния',Bulgaria:'Болгария',Serbia:'Сербия','Golden Horde':'Золотая Орда',Novgorod:'Новгород',Muscovy:'Москва','Grand Duchy of Moscow':'Московское княжество',Byzantium:'Византия','Ottoman Empire':'Османская империя','Polish-Lithuanian Commonwealth':'Речь Посполитая','Grand Duchy of Lithuania':'Великое княжество Литовское'};

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const yearPart=(v)=>{const m=String(v??'').match(/-?\d{3,4}/);return m?Number(m[0]):null;};
const reverseRing=(r)=>[...r].reverse();
function normalizeFeature(feature){
  if(!feature?.geometry||!['Polygon','MultiPolygon'].includes(feature.geometry.type))return null;
  let next=feature;
  if(geoArea(next)>TWO_PI){
    const geometry=feature.geometry.type==='Polygon'?{type:'Polygon',coordinates:feature.geometry.coordinates.map(reverseRing)}:{type:'MultiPolygon',coordinates:feature.geometry.coordinates.map((p)=>p.map(reverseRing))};
    next={...feature,geometry};
  }
  const area=geoArea(next);return Number.isFinite(area)&&area>0&&area<=MAX_FEATURE_AREA?next:null;
}
function normalizeCollection(c){return{...c,features:(c?.features??[]).map(normalizeFeature).filter(Boolean)};}
function featureName(f){const p=f?.properties??{};return[p.ABBREVN,p.NAME,p.SUBJECTO,p.PARTOF,p.name,p.ADMIN,p.entity,p.polity].find((x)=>typeof x==='string'&&x.trim())?.trim()??'';}
function featureColor(f,i){const n=featureName(f);let h=17+i;for(let k=0;k<n.length;k++)h=((h<<5)-h+n.charCodeAt(k))|0;return PALETTE[Math.abs(h)%PALETTE.length];}
function validAt(f,y){const s=yearPart(f?.properties?.start_date),e=yearPart(f?.properties?.end_date);return(s===null||y>=s)&&(e===null||y<=e);}
function selectRussia(c,y){if(!c?.features?.length)return[];const exact=c.features.filter((f)=>validAt(f,y));if(exact.length)return exact;const prev=c.features.map((feature)=>({feature,start:yearPart(feature.properties?.start_date)})).filter((x)=>x.start!==null&&x.start<=y).sort((a,b)=>b.start-a.start);return prev.length?prev.filter((x)=>x.start===prev[0].start).map((x)=>x.feature):[];}
function drawStar(ctx,x,y,o,i){ctx.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,r=k%2?i:o,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
function latLonVector(lat,lon,d){const p=lat*Math.PI/180,l=lon*Math.PI/180;return new THREE.Vector3(Math.cos(p)*Math.cos(l),Math.sin(p),-Math.cos(p)*Math.sin(l)).multiplyScalar(d);}

function useHistoricalData(year,polityId){
  const[index,setIndex]=useState(null),[manifest,setManifest]=useState(null),[world,setWorld]=useState(null),[worldYear,setWorldYear]=useState(null),[russia,setRussia]=useState(null);
  const wc=useRef(new Map()),rc=useRef(new Map());
  useEffect(()=>{const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();Promise.all([fetch(`${base}/data/territory/world-history/index.json`,{signal:c.signal}).then((r)=>r.json()),fetch(`${base}/data/territory/archive/manifest.json`,{signal:c.signal}).then((r)=>r.json())]).then(([a,b])=>{if(!c.signal.aborted){setIndex(a);setManifest(b);}}).catch(()=>{});return()=>c.abort();},[]);
  useEffect(()=>{if(!index?.snapshots?.length)return;const list=[...index.snapshots].sort((a,b)=>a.year-b.year),snap=[...list].reverse().find((s)=>s.year<=year)??list[0],cached=wc.current.get(snap.file);if(cached){setWorld(cached);setWorldYear(snap.year);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();fetch(`${base}/data/territory/world-history/${snap.file}`,{signal:c.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((d)=>{wc.current.set(snap.file,d);if(!c.signal.aborted){setWorld(d);setWorldYear(snap.year);}}).catch(()=>{});return()=>c.abort();},[index,year]);
  useEffect(()=>{const e=manifest?.polities?.find((p)=>p.polity_id===polityId&&p.file&&p.features>0);if(!e?.file){setRussia(null);return;}const cached=rc.current.get(e.file);if(cached){setRussia(cached);return;}const base=process.env.NEXT_PUBLIC_BASE_PATH??'',c=new AbortController();fetch(`${base}/data/territory/archive/${e.file}`,{signal:c.signal,cache:'force-cache'}).then((r)=>r.json()).then(normalizeCollection).then((d)=>{rc.current.set(e.file,d);if(!c.signal.aborted)setRussia(d);}).catch(()=>{});return()=>c.abort();},[manifest,polityId]);
  return{index,world,worldYear,russia};
}

function buildTexture(world,russiaFeatures,year,period,mobile){
  const width=mobile?1536:2048,height=width/2,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d'),projection=geoEquirectangular().translate([width/2,height/2]).scale(width/(2*Math.PI)).precision(.35),path=geoPath(projection,ctx);
  const ocean=ctx.createLinearGradient(0,0,width,height);ocean.addColorStop(0,'#0d3240');ocean.addColorStop(.5,'#08232e');ocean.addColorStop(1,'#03141c');ctx.fillStyle=ocean;ctx.fillRect(0,0,width,height);
  ctx.beginPath();path(graticule);ctx.strokeStyle='rgba(163,193,190,.16)';ctx.lineWidth=.7;ctx.stroke();
  const countries=[];
  (world?.features??[]).forEach((f,i)=>{ctx.beginPath();path(f);ctx.fillStyle=featureColor(f,i);ctx.fill();ctx.strokeStyle='rgba(225,216,191,.46)';ctx.lineWidth=.55;ctx.stroke();const area=geoArea(f),n=featureName(f);if(area>.025&&n){const c=geoCentroid(f),p=projection(c);if(p)countries.push({name:RU[n]??n,x:p[0],y:p[1],area});}});
  if(russiaFeatures.length){const c={type:'FeatureCollection',features:russiaFeatures};ctx.beginPath();path(c);ctx.fillStyle='#355d3b';ctx.fill();ctx.strokeStyle='#e2c269';ctx.lineWidth=1.5;ctx.stroke();}
  ctx.textAlign='center';ctx.textBaseline='middle';countries.sort((a,b)=>b.area-a.area).slice(0,mobile?11:18).forEach((l)=>{const s=clamp(11+Math.sqrt(l.area)*24,12,mobile?18:22);ctx.font=`500 ${s}px Georgia,serif`;ctx.lineWidth=2.8;ctx.strokeStyle='rgba(2,9,12,.82)';ctx.strokeText(l.name,l.x,l.y);ctx.fillStyle='#eee5cc';ctx.fillText(l.name,l.x,l.y);});
  if(russiaFeatures.length){const c=geoCentroid({type:'FeatureCollection',features:russiaFeatures}),p=projection(c);if(p){ctx.font=`600 ${mobile?23:29}px Georgia,serif`;ctx.lineWidth=4;ctx.strokeStyle='rgba(2,9,12,.85)';ctx.strokeText(period.label,p[0],p[1]);ctx.fillStyle='#f2e5c1';ctx.fillText(period.label,p[0],p[1]);}}
  const places=TERRITORY_PLACES.filter((p)=>(p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year&&(p.kind==='capital'||MAJOR_RUSSIAN_CITIES.has(p.name))).slice(0,mobile?22:36);
  ctx.textAlign='left';places.forEach((place)=>{const p=projection([place.lon,place.lat]);if(!p)return;const capital=place.kind==='capital';ctx.fillStyle='#f4dfa5';if(capital)drawStar(ctx,p[0],p[1],4.8,2.1);else{ctx.beginPath();ctx.arc(p[0],p[1],1.8,0,TWO_PI);ctx.fill();}ctx.font=`${capital?600:500} ${capital?13:11}px Georgia,serif`;ctx.lineWidth=2.5;ctx.strokeStyle='rgba(2,9,12,.88)';ctx.strokeText(place.name,p[0]+(capital?7:5),p[1]+1);ctx.fillStyle='#f3e9cf';ctx.fillText(place.name,p[0]+(capital?7:5),p[1]+1);});
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=2;texture.needsUpdate=true;return texture;
}

export function HistoricalTerritoryGlobeWebGLV2({initialYear=TERRITORY_MAX_YEAR}){
  const hostRef=useRef(null),sceneRef=useRef(null),timelineRef=useRef(null),controlsRef=useRef(null),textureRef=useRef(null),materialRef=useRef(null),timerRef=useRef(null),scrollFrame=useRef(null);
  const[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR)),[fullscreen,setFullscreen]=useState(false),[mobile,setMobile]=useState(false);
  const period=territoryPeriodAt(year),{index,world,worldYear,russia}=useHistoricalData(year,period.polityId),russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const snapshots=useMemo(()=>{const s=new Set(POLITY_TRANSITION_YEARS);for(const x of index?.snapshots??[])s.add(x.year);s.add(TERRITORY_MAX_YEAR);return[...s].filter((y)=>y>=TERRITORY_MIN_YEAR&&y<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  const ticks=useMemo(()=>{const out=[];for(let y=Math.ceil(TERRITORY_MIN_YEAR/10)*10;y<=TERRITORY_MAX_YEAR;y+=10)out.push(y);return out;},[]);

  useEffect(()=>{const q=matchMedia('(max-width:720px)');const run=()=>setMobile(q.matches);run();q.addEventListener('change',run);return()=>q.removeEventListener('change',run);},[]);
  useEffect(()=>{const host=hostRef.current;if(!host)return;const compact=window.innerWidth<=720,scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);camera.position.set(3.5,2.0,3.55);
    const renderer=new THREE.WebGLRenderer({antialias:!compact,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,compact?1.15:1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0x000000,0);host.appendChild(renderer.domElement);
    const geometry=new THREE.SphereGeometry(1,compact?64:80,compact?40:52),material=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.9,metalness:0});materialRef.current=material;const earth=new THREE.Mesh(geometry,material);scene.add(earth);
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';new THREE.TextureLoader().load(`${base}/data/territory/terrain/earth_normal_2048.jpg`,(normal)=>{normal.wrapS=THREE.RepeatWrapping;normal.colorSpace=THREE.NoColorSpace;material.normalMap=normal;material.normalScale.set(.32,.32);material.needsUpdate=true;});
    scene.add(new THREE.HemisphereLight(0xc6d7d5,0x17140e,1.2));const sun=new THREE.DirectionalLight(0xffe0a4,2.2);sun.position.set(-3,3,4);scene.add(sun);const fill=new THREE.DirectionalLight(0x668fa1,.5);fill.position.set(4,-1,-3);scene.add(fill);
    const glowMat=new THREE.ShaderMaterial({transparent:true,side:THREE.BackSide,blending:THREE.AdditiveBlending,depthWrite:false,uniforms:{glowColor:{value:new THREE.Color(0x6e99a3)}},vertexShader:'varying vec3 vNormal;void main(){vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vNormal;uniform vec3 glowColor;void main(){float i=pow(max(0.0,0.66-dot(vNormal,vec3(0.,0.,1.))),2.8);gl_FragColor=vec4(glowColor,i*.2);}'});scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.025,48,32),glowMat));
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.105;controls.enablePan=false;controls.rotateSpeed=.9;controls.zoomSpeed=1.05;controls.minDistance=1.08;controls.maxDistance=6.5;controls.target.set(0,0,0);controlsRef.current=controls;
    const resize=()=>{const r=host.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(1,r.width)/Math.max(1,r.height);camera.updateProjectionMatrix();};resize();const ro=new ResizeObserver(resize);ro.observe(host);
    let raf=0;const loop=()=>{controls.update();renderer.render(scene,camera);raf=requestAnimationFrame(loop);};loop();sceneRef.current={camera,renderer,geometry,material,glowMat,ro,raf};
    return()=>{cancelAnimationFrame(raf);ro.disconnect();controls.dispose();geometry.dispose();material.dispose();glowMat.dispose();renderer.dispose();renderer.domElement.remove();sceneRef.current=null;controlsRef.current=null;};
  },[]);

  useEffect(()=>{if(!world||!materialRef.current)return;clearTimeout(timerRef.current);timerRef.current=setTimeout(()=>{const tex=buildTexture(world,russiaFeatures,year,period,mobile);textureRef.current?.dispose();textureRef.current=tex;materialRef.current.map=tex;materialRef.current.needsUpdate=true;},180);return()=>clearTimeout(timerRef.current);},[world,russiaFeatures,year,period.label,mobile]);
  const focusRussia=useCallback(()=>{const c=controlsRef.current,r=sceneRef.current;if(!c||!r)return;const[lon,lat]=period.focus;r.camera.position.copy(latLonVector(lat,lon,3.65));c.target.set(0,0,0);c.update();},[period.focus]);
  useEffect(()=>{focusRussia();},[period.polityId]);
  useEffect(()=>{const h=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',h);return()=>document.removeEventListener('fullscreenchange',h);},[]);
  async function toggleFullscreen(){const el=hostRef.current?.closest(`.${styles.scene}`);if(!el)return;if(document.fullscreenElement)await document.exitFullscreen();else await el.requestFullscreen();}
  const scrollToYear=useCallback((next,behavior='smooth')=>{const el=timelineRef.current;if(!el)return;const y=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);el.scrollTo({left:(y-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(y);},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[]);
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{const el=timelineRef.current;if(el)setYear(clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));});}
  function jump(d){const list=d>0?snapshots.filter((y)=>y>year):snapshots.filter((y)=>y<year).reverse();if(list.length)scrollToYear(list[0]);}
  function zoom(f){const c=controlsRef.current,r=sceneRef.current;if(!c||!r)return;const v=r.camera.position.clone().multiplyScalar(f),d=v.length();v.setLength(clamp(d,1.08,6.5));r.camera.position.copy(v);c.update();}

  return <main className={styles.page}><section className={styles.scene}><div className={styles.space}/><div ref={hostRef} className={styles.globeHost}/>
    <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}><button className={styles.active}>Глобус</button><button onClick={focusRussia}>К России</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
    <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года</p></aside>
    <div className={styles.zoomTools}><button onClick={()=>zoom(.78)}>+</button><button onClick={()=>zoom(1.28)}>−</button><button onClick={focusRussia}>◎</button></div>
    <section className={styles.timeline}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Прокручивайте линию времени</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map((y)=><div key={y} className={`${styles.tick} ${y%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{y%50===0&&<span>{y}</span>}</div>)}{snapshots.map((y)=><i key={y} className={styles.eventTick} style={{left:`calc(50vw + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
  </section></main>;
}
