'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Map as MapLibreMap,Marker} from 'maplibre-gl';
import {
  POLITY_TRANSITION_YEARS,
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt,
} from './territoryChronology';
import {TERRITORY_PLACES} from './territoryPlaces';
import styles from './territory-webgl.module.css';

const YEAR_PX=6;
const TERRARIUM='https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY:any={type:'FeatureCollection',features:[]};
const PALETTE=['#9a513f','#617d42','#526fa0','#a26d36','#3c7d7d','#8b5740','#447c5e','#8d4d69','#6556a0','#457a72','#a45834','#788243','#79548e','#91733f'];

type ViewMode='relief'|'states';
type ProjectionMode='globe'|'map';
type Point=[number,number];
type MarkerEntry={marker:Marker;element:HTMLDivElement;rank:number;kind:'country'|'capital'|'regional';coords:Point};

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const rad=(v:number)=>v*Math.PI/180;
const normalizeLon=(lon:number)=>{let v=lon;while(v>180)v-=360;while(v<-180)v+=360;return v;};
const yearPart=(v:unknown)=>{const m=String(v??'').match(/-?\d{3,4}/);return m?Number(m[0]):null;};

function frontOfGlobe(center:Point,point:Point){
  const a=rad(center[1]),b=rad(point[1]),d=rad(point[0]-center[0]);
  return Math.sin(a)*Math.sin(b)+Math.cos(a)*Math.cos(b)*Math.cos(d)>0.16;
}

function featureName(f:any){
  const p=f?.properties??{};
  return [p.NAME_RU,p.NAME_LONG_RU,p.name_ru,p.RU_NAME,p.NAME,p.NAME_LONG,p.GEOUNIT,p.ADMIN,p.name,p.entity,p.polity,p.SUBJECTO,p.PARTOF]
    .find((v)=>typeof v==='string'&&v.trim())?.trim()??'';
}

function featureColor(f:any,i:number){
  const name=featureName(f);let h=17+i*23;
  for(let n=0;n<name.length;n++)h=((h<<5)-h+name.charCodeAt(n))|0;
  return PALETTE[Math.abs(h)%PALETTE.length];
}

function decorateWorld(world:any){
  if(!world?.features)return EMPTY;
  return {type:'FeatureCollection',features:world.features.filter((f:any)=>f?.geometry).map((f:any,i:number)=>({
    ...f,properties:{...(f.properties??{}),__name:featureName(f),__color:featureColor(f,i)}
  }))};
}

function unwrapRing(ring:any[]):Point[]{
  if(!Array.isArray(ring)||!ring.length)return[];
  const out:Point[]=[];let prev=Number(ring[0][0]);
  for(const raw of ring){let lon=Number(raw[0]);const lat=Number(raw[1]);if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;while(lon-prev>180)lon-=360;while(lon-prev<-180)lon+=360;out.push([lon,lat]);prev=lon;}
  return out;
}

function ringMetric(ring:any[]){
  const pts=unwrapRing(ring);if(pts.length<3)return null;let cross=0,cx=0,cy=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){const c=pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1];cross+=c;cx+=(pts[j][0]+pts[i][0])*c;cy+=(pts[j][1]+pts[i][1])*c;}
  const area=cross/2;if(Math.abs(area)<1e-8)return null;
  return {area:Math.abs(area),centroid:[normalizeLon(cx/(6*area)),cy/(6*area)] as Point};
}

function countryAnchors(world:any){
  const items:any[]=[];
  for(const f of world?.features??[]){
    const name=featureName(f);if(!name)continue;
    const g=f.geometry;const polygons=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
    let best:any=null,total=0;
    for(const polygon of polygons){const m=ringMetric(polygon?.[0]);if(!m)continue;total+=m.area;if(!best||m.area>best.area)best=m;}
    if(best&&total>0.12)items.push({name,coords:best.centroid,area:total});
  }
  return items.sort((a,b)=>b.area-a.area).slice(0,160);
}

function validAt(f:any,year:number){
  const start=yearPart(f?.properties?.start_date),end=yearPart(f?.properties?.end_date);
  return (start===null||year>=start)&&(end===null||year<=end);
}

function selectRussia(collection:any,year:number){
  if(!collection?.features?.length)return[];
  const exact=collection.features.filter((f:any)=>validAt(f,year));if(exact.length)return exact;
  const previous=collection.features.map((feature:any)=>({feature,start:yearPart(feature.properties?.start_date)})).filter((x:any)=>x.start!==null&&x.start<=year).sort((a:any,b:any)=>b.start-a.start);
  if(!previous.length)return[];return previous.filter((x:any)=>x.start===previous[0].start).map((x:any)=>x.feature);
}

function snapshotAt(index:any,year:number){
  const rows=[...(index?.snapshots??[])].sort((a:any,b:any)=>a.year-b.year);if(!rows.length)return null;let chosen=rows[0];for(const row of rows){if(row.year<=year)chosen=row;else break;}return chosen;
}

function riversForMap(rivers:any){
  if(!rivers?.features)return EMPTY;
  return {type:'FeatureCollection',features:rivers.features.map((f:any)=>{const rank=Number(f?.properties?.scalerank);const tier=Number.isFinite(rank)&&rank<=3?0:Number.isFinite(rank)&&rank<=6?1:2;return {...f,properties:{...(f.properties??{}),__tier:tier}};})};
}

function baseStyle():any{
  return {version:8,sources:{
    dem:{type:'raster-dem',tiles:[TERRARIUM],tileSize:256,minzoom:0,maxzoom:15,encoding:'terrarium'},
    world:{type:'geojson',data:EMPTY},russia:{type:'geojson',data:EMPTY},rivers:{type:'geojson',data:EMPTY},
  },layers:[
    {id:'ocean',type:'background',paint:{'background-color':'#07191f'}},
    {id:'world-fill',type:'fill',source:'world',paint:{'fill-color':['coalesce',['get','__color'],'#506247'],'fill-opacity':0.72,'fill-outline-color':'#d0a35b'}},
    {id:'terrain-shade',type:'hillshade',source:'dem',paint:{'hillshade-exaggeration':0.34,'hillshade-shadow-color':'#06100e','hillshade-highlight-color':'#6f775c','hillshade-accent-color':'#263d34','hillshade-illumination-direction':318,'hillshade-illumination-anchor':'viewport'}},
    {id:'world-border-casing',type:'line',source:'world',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#0a0d0d','line-opacity':1,'line-width':['interpolate',['linear'],['zoom'],1,3.4,2.3,4.0,4,4.8,7,6.2]}},
    {id:'world-border',type:'line',source:'world',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#e2b768','line-opacity':1,'line-width':['interpolate',['linear'],['zoom'],1,1.45,2.3,1.8,4,2.2,7,3.0]}},
    {id:'russia-fill',type:'fill',source:'russia',paint:{'fill-color':'#8d7138','fill-opacity':0.36}},
    {id:'russia-border-casing',type:'line',source:'russia',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#090c0c','line-opacity':1,'line-width':['interpolate',['linear'],['zoom'],1,5.6,2.3,6.4,4,7.5,7,9]}},
    {id:'russia-border',type:'line',source:'russia',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#f2bd4e','line-opacity':1,'line-width':['interpolate',['linear'],['zoom'],1,2.6,2.3,3.2,4,3.9,7,5]}},
    {id:'rivers',type:'line',source:'rivers',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','__tier'],0,'#61a6c0',1,'#4e859a','#376677'],'line-opacity':['match',['get','__tier'],0,.95,1,.78,.56],'line-width':['interpolate',['linear'],['zoom'],1,['match',['get','__tier'],0,.8,1,.45,.2],5,['match',['get','__tier'],0,1.8,1,.95,.5],9,['match',['get','__tier'],0,3.5,1,1.8,.9]]}},
  ]};
}

function styleMarker(el:HTMLDivElement,kind:MarkerEntry['kind']){
  el.style.pointerEvents='none';el.style.userSelect='none';el.style.whiteSpace='nowrap';el.style.fontFamily='Inter,Arial,sans-serif';el.style.textShadow='0 2px 3px #030708,0 0 7px #030708';el.style.zIndex='20';
  if(kind==='country'){el.style.color='#e7c77f';el.style.fontWeight='750';el.style.fontSize='14px';el.style.letterSpacing='.03em';}
  else if(kind==='capital'){el.style.color='#f2be4f';el.style.fontWeight='800';el.style.fontSize='15px';}
  else{el.style.color='#91c6c2';el.style.fontWeight='650';el.style.fontSize='14px';}
}

export function HistoricalTerritoryMapLibreV19({initialYear=TERRITORY_MAX_YEAR}:{initialYear?:number}){
  const sceneRef=useRef<HTMLElement|null>(null),hostRef=useRef<HTMLDivElement|null>(null),mapRef=useRef<MapLibreMap|null>(null),timelineRef=useRef<HTMLDivElement|null>(null);
  const countryMarkers=useRef<MarkerEntry[]>([]),placeMarkers=useRef<MarkerEntry[]>([]),scrollFrame=useRef<number|null>(null);
  const [ready,setReady]=useState(false),[mobile,setMobile]=useState(false),[fullscreen,setFullscreen]=useState(false),[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
  const [mode,setMode]=useState<ViewMode>('relief'),[projection,setProjection]=useState<ProjectionMode>('globe');
  const [index,setIndex]=useState<any>(null),[manifest,setManifest]=useState<any>(null),[historicalWorld,setHistoricalWorld]=useState<any>(null),[historicalYear,setHistoricalYear]=useState<number|null>(null),[modernWorld,setModernWorld]=useState<any>(null),[russia,setRussia]=useState<any>(null),[rivers,setRivers]=useState<any>(null);
  const worldCache=useRef(new Map<string,any>()),russiaCache=useRef(new Map<string,any>()),worldFile=useRef<string|null>(null);
  const period=territoryPeriodAt(year),russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const displayWorld=useMemo(()=>year>=2010&&modernWorld?modernWorld:historicalWorld,[year,modernWorld,historicalWorld]);
  const displayYear=year>=2010&&modernWorld?year:historicalYear;
  const activePlaces=useMemo(()=>TERRITORY_PLACES.filter((p)=>(p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year),[year]);
  const snapshots=useMemo(()=>{const years=new Set<number>(POLITY_TRANSITION_YEARS);for(const s of index?.snapshots??[])years.add(s.year);years.add(TERRITORY_MAX_YEAR);return [...years].filter(v=>v>=TERRITORY_MIN_YEAR&&v<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  const ticks=useMemo(()=>{const values:number[]=[];for(let v=Math.ceil(TERRITORY_MIN_YEAR/10)*10;v<=TERRITORY_MAX_YEAR;v+=10)values.push(v);return values;},[]);
  const defaultFocus:Point=year>=1992?[60,57]:period.focus;

  useEffect(()=>{const q=matchMedia('(max-width:720px)');const update=()=>setMobile(q.matches);update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
  useEffect(()=>{
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()),
      fetch(`${base}/data/territory/archive/manifest.json`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()),
      fetch(`${base}/data/territory/hydro/rivers_50m.geojson`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null),
      fetch(`${base}/data/territory/cultural/countries_50m.geojson`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null),
    ]).then(([a,b,c,d])=>{if(controller.signal.aborted)return;setIndex(a);setManifest(b);if(c)setRivers(c);if(d)setModernWorld(d);}).catch(()=>{});
    return()=>controller.abort();
  },[]);
  useEffect(()=>{
    const snapshot=snapshotAt(index,year);if(!snapshot||worldFile.current===snapshot.file)return;worldFile.current=snapshot.file;
    const cached=worldCache.current.get(snapshot.file);if(cached){setHistoricalWorld(cached);setHistoricalYear(snapshot.year);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()).then(data=>{worldCache.current.set(snapshot.file,data);if(!controller.signal.aborted){setHistoricalWorld(data);setHistoricalYear(snapshot.year);}}).catch(()=>{worldFile.current=null;});return()=>controller.abort();
  },[index,year]);
  useEffect(()=>{
    const entry=manifest?.polities?.find((i:any)=>i.polity_id===period.polityId&&i.file&&i.features>0);if(!entry?.file){setRussia(null);return;}
    const cached=russiaCache.current.get(entry.file);if(cached){setRussia(cached);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()).then(data=>{russiaCache.current.set(entry.file,data);if(!controller.signal.aborted)setRussia(data);}).catch(()=>{});return()=>controller.abort();
  },[manifest,period.polityId]);

  const updateMarkerVisibility=useCallback(()=>{
    const map=mapRef.current;if(!map)return;const z=map.getZoom(),center=map.getCenter(),centerPoint:Point=[center.lng,center.lat],isGlobe=projection==='globe';
    const countryLimit=z<3.2?34:z<4.4?70:130;
    for(const item of countryMarkers.current){const front=!isGlobe||frontOfGlobe(centerPoint,item.coords);item.element.style.display=item.rank<countryLimit&&front?'block':'none';}
    for(const item of placeMarkers.current){const zoomVisible=item.kind==='capital'?z>=4.55:z>=6.25;const front=!isGlobe||frontOfGlobe(centerPoint,item.coords);item.element.style.display=zoomVisible&&front?'block':'none';}
  },[projection]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;let alive=true;const map=new MapLibreMap({container:host,style:baseStyle(),center:[60,57],zoom:window.innerWidth<=720?1.95:2.35,minZoom:1,maxZoom:12,pitch:0,bearing:0,attributionControl:false,renderWorldCopies:false,canvasContextAttributes:{antialias:true}});
    mapRef.current=map;map.scrollZoom.setWheelZoomRate(1/480);map.dragRotate.disable();map.touchZoomRotate.disableRotation();
    map.on('style.load',()=>{if(!alive)return;map.setProjection({type:'globe'});map.resize();setReady(true);});
    map.on('zoom',updateMarkerVisibility);map.on('move',updateMarkerVisibility);
    const onFullscreen=()=>{setFullscreen(Boolean(document.fullscreenElement));requestAnimationFrame(()=>map.resize());};document.addEventListener('fullscreenchange',onFullscreen);
    return()=>{alive=false;document.removeEventListener('fullscreenchange',onFullscreen);countryMarkers.current.forEach(x=>x.marker.remove());placeMarkers.current.forEach(x=>x.marker.remove());map.remove();mapRef.current=null;};
  },[updateMarkerVisibility]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready||!displayWorld)return;(map.getSource('world')as any)?.setData(decorateWorld(displayWorld));
    countryMarkers.current.forEach(x=>x.marker.remove());countryMarkers.current=[];
    countryAnchors(displayWorld).forEach((item:any,rank:number)=>{const element=document.createElement('div');element.textContent=item.name;styleMarker(element,'country');const marker=new Marker({element,anchor:'center'}).setLngLat(item.coords).addTo(map);countryMarkers.current.push({marker,element,rank,kind:'country',coords:item.coords});});
    updateMarkerVisibility();
  },[displayWorld,ready,updateMarkerVisibility]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;(map.getSource('russia')as any)?.setData({type:'FeatureCollection',features:russiaFeatures});},[russiaFeatures,ready]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;(map.getSource('rivers')as any)?.setData(riversForMap(rivers));},[rivers,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;placeMarkers.current.forEach(x=>x.marker.remove());placeMarkers.current=[];
    activePlaces.forEach((place,index)=>{const element=document.createElement('div');element.textContent=place.kind==='capital'?`★ ${place.name}`:`• ${place.name}`;styleMarker(element,place.kind);const coords:Point=[place.lon,place.lat];const marker=new Marker({element,anchor:'left'}).setLngLat(coords).addTo(map);placeMarkers.current.push({marker,element,rank:index,kind:place.kind,coords});});updateMarkerVisibility();
  },[activePlaces,ready,updateMarkerVisibility]);

  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;if(mode==='states'){map.setPaintProperty('world-fill','fill-opacity',.94);map.setPaintProperty('terrain-shade','hillshade-exaggeration',.18);}else{map.setPaintProperty('world-fill','fill-opacity',.72);map.setPaintProperty('terrain-shade','hillshade-exaggeration',.34);}},[mode,ready]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;map.setProjection({type:projection==='globe'?'globe':'mercator'});requestAnimationFrame(updateMarkerVisibility);},[projection,ready,updateMarkerVisibility]);

  const focusRussia=useCallback(()=>{const map=mapRef.current;if(map)map.easeTo({center:defaultFocus,zoom:mobile?1.95:2.35,pitch:0,bearing:0,duration:420});},[defaultFocus,mobile]);
  const zoom=useCallback((d:number)=>{const map=mapRef.current;if(map)map.easeTo({zoom:clamp(map.getZoom()+d,1,12),duration:170});},[]);
  const toggleFullscreen=useCallback(async()=>{const scene=sceneRef.current;if(!scene)return;if(document.fullscreenElement)await document.exitFullscreen();else await scene.requestFullscreen();},[]);
  const scrollToYear=useCallback((next:number,behavior:ScrollBehavior='smooth')=>{const el=timelineRef.current;if(!el)return;const target=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);el.scrollTo({left:(target-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(target);},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[initialYear,scrollToYear]);
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{scrollFrame.current=null;const el=timelineRef.current;if(!el)return;setYear(clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));});}
  function onTimelineWheel(e:React.WheelEvent<HTMLElement>){const el=timelineRef.current;if(!el)return;const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(!raw)return;e.preventDefault();el.scrollLeft+=raw*.72;}
  function jump(direction:number){const candidates=direction>0?snapshots.filter(v=>v>year):snapshots.filter(v=>v<year).reverse();if(candidates.length)scrollToYear(candidates[0]);}

  return <main className={styles.page}><section ref={sceneRef} className={styles.scene}>
    <div className={styles.space}/><div ref={hostRef} className={`${styles.globeHost} ${styles.mapLibreHost}`}/>
    <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}><div className={styles.modeGroup}><button className={mode==='relief'?styles.active:''} onClick={()=>setMode('relief')}>Рельеф</button><button className={mode==='states'?styles.active:''} onClick={()=>setMode('states')}>Государства</button></div><button className={styles.projectionToggle} onClick={()=>setProjection(v=>v==='globe'?'map':'globe')}>{projection==='globe'?'Карта':'Глобус'}</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
    <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {displayYear??'—'} года · государства, постоянные границы, DEM-рельеф и гидрография</p></aside>
    <div className={styles.zoomTools}><button onClick={()=>zoom(.8)}>+</button><button onClick={()=>zoom(-.8)}>−</button><button onClick={focusRussia}>◎</button></div>
    <section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map(value=><i key={value} className={`${styles.tick} ${value%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{value%50===0?<span>{value}</span>:null}</i>)}{POLITY_TRANSITION_YEARS.map(value=><i key={`e-${value}`} className={styles.eventTick} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
  </section></main>;
}
