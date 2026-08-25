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
const ESRI_TERRAIN='https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_HILLSHADE='https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
const EMPTY:any={type:'FeatureCollection',features:[]};
const PALETTE=['#5f493f','#4d5b3f','#45536b','#675039','#3e5960','#5b4938','#40584b','#5e4350','#4d4565','#405857','#684735','#4e5a38','#58465d','#615541'];

type ViewMode='relief'|'borders'|'states';
type ProjectionMode='globe'|'map';
type Point=[number,number];
type MarkerEntry={marker:Marker;element:HTMLDivElement;rank:number;kind:'country'|'capital'|'regional'};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const yearPart=(value:unknown)=>{const match=String(value??'').match(/-?\d{3,4}/);return match?Number(match[0]):null;};
const normalizeLon=(lon:number)=>{let value=lon;while(value>180)value-=360;while(value<-180)value+=360;return value;};

function unwrapRing(ring:any[]):Point[]{
  if(!Array.isArray(ring)||!ring.length)return[];
  const first:Point=[Number(ring[0][0]),Number(ring[0][1])];
  const output:Point[]=[first];
  let previous=first[0];
  for(let i=1;i<ring.length;i++){
    let lon=Number(ring[i][0]);const lat=Number(ring[i][1]);
    if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
    while(lon-previous>180)lon-=360;
    while(lon-previous<-180)lon+=360;
    output.push([lon,lat]);previous=lon;
  }
  return output;
}

function signedArea(ring:any[]){
  const points=unwrapRing(ring);let sum=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++)sum+=points[j][0]*points[i][1]-points[i][0]*points[j][1];
  return sum/2;
}

function rewindRing(ring:any[],ccw:boolean){
  if(!Array.isArray(ring)||ring.length<4)return ring;
  const area=signedArea(ring);if(!Number.isFinite(area)||Math.abs(area)<1e-10)return ring;
  return (area>0)===ccw?ring:[...ring].reverse();
}

function rewindGeometry(geometry:any){
  if(geometry?.type==='Polygon')return{...geometry,coordinates:(geometry.coordinates??[]).map((ring:any[],i:number)=>rewindRing(ring,i===0))};
  if(geometry?.type==='MultiPolygon')return{...geometry,coordinates:(geometry.coordinates??[]).map((polygon:any[])=>polygon.map((ring:any[],i:number)=>rewindRing(ring,i===0)))};
  return geometry;
}

function featureName(feature:any){
  const p=feature?.properties??{};
  return[p.NAME_RU,p.name_ru,p.RU_NAME,p.NAME,p.name,p.ADMIN,p.entity,p.polity,p.ABBREVN,p.SUBJECTO,p.PARTOF].find((v)=>typeof v==='string'&&v.trim())?.trim()??'';
}

function countryColor(feature:any,index:number){
  const name=featureName(feature);let hash=31+index*17;
  for(let i=0;i<name.length;i++)hash=((hash<<5)-hash+name.charCodeAt(i))|0;
  return PALETTE[Math.abs(hash)%PALETTE.length];
}

function worldFill(world:any){
  if(!world?.features)return EMPTY;
  return{type:'FeatureCollection',features:world.features.filter((f:any)=>f?.geometry).map((f:any,i:number)=>({
    ...f,geometry:rewindGeometry(f.geometry),properties:{...(f.properties??{}),__color:countryColor(f,i),__name:featureName(f)},
  }))};
}

function splitDateline(ring:any[]):Point[][]{
  if(!Array.isArray(ring)||ring.length<2)return[];
  const out:Point[][]=[];let current:Point[]=[];let previous:Point|null=null;
  for(const raw of ring){
    const point:Point=[Number(raw[0]),Number(raw[1])];
    if(!Number.isFinite(point[0])||!Number.isFinite(point[1]))continue;
    if(previous&&Math.abs(point[0]-previous[0])>180){if(current.length>1)out.push(current);current=[];}
    current.push(point);previous=point;
  }
  if(current.length>1)out.push(current);
  return out;
}

function borderLines(collection:any){
  const features:any[]=[];
  for(const feature of collection?.features??[]){
    const g=feature?.geometry;if(!g)continue;
    const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const polygon of polygons){
      const outer=polygon?.[0];if(!outer)continue;
      for(const segment of splitDateline(outer))features.push({type:'Feature',properties:{name:featureName(feature)},geometry:{type:'LineString',coordinates:segment}});
    }
  }
  return{type:'FeatureCollection',features};
}

function ringMetric(ring:any[]){
  const points=unwrapRing(ring);if(points.length<3)return null;
  let crossSum=0,cx=0,cy=0;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const cross=points[j][0]*points[i][1]-points[i][0]*points[j][1];crossSum+=cross;cx+=(points[j][0]+points[i][0])*cross;cy+=(points[j][1]+points[i][1])*cross;
  }
  const area=crossSum/2;if(Math.abs(area)<1e-10)return null;
  return{area:Math.abs(area),centroid:[normalizeLon(cx/(6*area)),cy/(6*area)] as Point};
}

function countryAnchors(world:any){
  const items:any[]=[];
  for(const feature of world?.features??[]){
    const name=featureName(feature);if(!name)continue;
    const g=feature?.geometry;const polygons=g?.type==='Polygon'?[g.coordinates]:g?.type==='MultiPolygon'?g.coordinates:[];
    let best:any=null,total=0;
    for(const polygon of polygons){const metric=ringMetric(polygon?.[0]);if(!metric)continue;total+=metric.area;if(!best||metric.area>best.area)best=metric;}
    if(best&&total>0.15)items.push({name,centroid:best.centroid,area:total});
  }
  items.sort((a,b)=>b.area-a.area);return items.slice(0,180);
}

function validAt(feature:any,year:number){
  const start=yearPart(feature?.properties?.start_date),end=yearPart(feature?.properties?.end_date);
  return(start===null||year>=start)&&(end===null||year<=end);
}

function selectRussia(collection:any,year:number){
  if(!collection?.features?.length)return[];
  const exact=collection.features.filter((f:any)=>validAt(f,year));if(exact.length)return exact;
  const previous=collection.features.map((feature:any)=>({feature,start:yearPart(feature.properties?.start_date)})).filter((i:any)=>i.start!==null&&i.start<=year).sort((a:any,b:any)=>b.start-a.start);
  if(!previous.length)return[];return previous.filter((i:any)=>i.start===previous[0].start).map((i:any)=>i.feature);
}

function snapshotAt(index:any,year:number){
  const snapshots=[...(index?.snapshots??[])].sort((a:any,b:any)=>a.year-b.year);if(!snapshots.length)return null;
  let selected=snapshots[0];for(const snapshot of snapshots){if(snapshot.year<=year)selected=snapshot;else break;}return selected;
}

function riversForMap(rivers:any){
  if(!rivers?.features)return EMPTY;
  return{type:'FeatureCollection',features:rivers.features.map((f:any)=>{const rank=Number(f?.properties?.scalerank);const tier=Number.isFinite(rank)&&rank<=3?0:Number.isFinite(rank)&&rank<=6?1:2;return{...f,properties:{...(f.properties??{}),__tier:tier}};})};
}

function baseStyle():any{
  return{version:8,sources:{
    terrain:{type:'raster',tiles:[ESRI_TERRAIN],tileSize:256,minzoom:0,maxzoom:13},
    hillshade:{type:'raster',tiles:[ESRI_HILLSHADE],tileSize:256,minzoom:0,maxzoom:15},
    world:{type:'geojson',data:EMPTY},worldBorders:{type:'geojson',data:EMPTY},russia:{type:'geojson',data:EMPTY},russiaBorders:{type:'geojson',data:EMPTY},rivers:{type:'geojson',data:EMPTY},
  },layers:[
    {id:'ocean',type:'background',paint:{'background-color':'#182326'}},
    {id:'terrain',type:'raster',source:'terrain',paint:{'raster-opacity':0.58,'raster-saturation':-0.68,'raster-contrast':0.32,'raster-brightness-min':0.015,'raster-brightness-max':0.28,'raster-fade-duration':60}},
    {id:'hillshade',type:'raster',source:'hillshade',paint:{'raster-opacity':0.50,'raster-saturation':-1,'raster-contrast':0.45,'raster-brightness-min':0.01,'raster-brightness-max':0.25,'raster-fade-duration':60}},
    {id:'world-fill',type:'fill',source:'world',paint:{'fill-color':['coalesce',['get','__color'],'#4b5144'],'fill-opacity':0.48}},
    {id:'russia-fill',type:'fill',source:'russia',paint:{'fill-color':'#6b5b35','fill-opacity':0.62}},
    {id:'world-border',type:'line',source:'worldBorders',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#a47b3d','line-opacity':0.96,'line-width':['interpolate',['linear'],['zoom'],1,1.25,3,1.55,6,2.1,10,2.8]}},
    {id:'russia-border',type:'line',source:'russiaBorders',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#d09a35','line-opacity':1,'line-width':['interpolate',['linear'],['zoom'],1,2.4,3,3.0,6,3.9,10,5.0]}},
    {id:'rivers',type:'line',source:'rivers',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','__tier'],0,'#56899b',1,'#426f80','#345966'],'line-opacity':['match',['get','__tier'],0,1,1,0.88,0.68],'line-width':['interpolate',['linear'],['zoom'],1,['match',['get','__tier'],0,1.0,1,0.55,0.28],5,['match',['get','__tier'],0,2.0,1,1.05,0.52],9,['match',['get','__tier'],0,3.6,1,1.9,0.95],12,['match',['get','__tier'],0,5.0,1,2.8,1.45]]}},
  ]};
}

function styleMarker(element:HTMLDivElement,kind:MarkerEntry['kind']){
  element.style.pointerEvents='none';element.style.userSelect='none';element.style.whiteSpace='nowrap';element.style.fontFamily='Inter, Arial, sans-serif';element.style.textShadow='0 1px 2px rgba(0,0,0,.95),0 0 5px rgba(0,0,0,.65)';element.style.transition='opacity 120ms ease';
  if(kind==='country'){element.style.color='#c7a45d';element.style.fontWeight='650';element.style.fontSize='13px';element.style.letterSpacing='.025em';}
  else if(kind==='capital'){element.style.color='#d1a347';element.style.fontWeight='700';element.style.fontSize='14px';}
  else{element.style.color='#aab3a6';element.style.fontWeight='550';element.style.fontSize='13px';}
}

export function HistoricalTerritoryMapLibreV17({initialYear=TERRITORY_MAX_YEAR}:{initialYear?:number}){
  const sceneRef=useRef<HTMLElement|null>(null),hostRef=useRef<HTMLDivElement|null>(null),mapRef=useRef<MapLibreMap|null>(null),timelineRef=useRef<HTMLDivElement|null>(null);
  const countryMarkers=useRef<MarkerEntry[]>([]),placeMarkers=useRef<MarkerEntry[]>([]),scrollFrame=useRef<number|null>(null);
  const [ready,setReady]=useState(false),[mobile,setMobile]=useState(false),[fullscreen,setFullscreen]=useState(false),[year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
  const [mode,setMode]=useState<ViewMode>('relief'),[projection,setProjection]=useState<ProjectionMode>('globe');
  const [index,setIndex]=useState<any>(null),[manifest,setManifest]=useState<any>(null),[world,setWorld]=useState<any>(null),[worldYear,setWorldYear]=useState<number|null>(null),[russia,setRussia]=useState<any>(null),[rivers,setRivers]=useState<any>(null);
  const worldCache=useRef(new Map<string,any>()),russiaCache=useRef(new Map<string,any>()),worldFile=useRef<string|null>(null);
  const period=territoryPeriodAt(year),russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const activePlaces=useMemo(()=>TERRITORY_PLACES.filter((p)=>(p.from??TERRITORY_MIN_YEAR)<=year&&(p.to??TERRITORY_MAX_YEAR)>=year),[year]);
  const snapshots=useMemo(()=>{const years=new Set<number>(POLITY_TRANSITION_YEARS);for(const s of index?.snapshots??[])years.add(s.year);years.add(TERRITORY_MAX_YEAR);return[...years].filter((v)=>v>=TERRITORY_MIN_YEAR&&v<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);},[index]);
  const ticks=useMemo(()=>{const values:number[]=[];for(let v=Math.ceil(TERRITORY_MIN_YEAR/10)*10;v<=TERRITORY_MAX_YEAR;v+=10)values.push(v);return values;},[]);

  useEffect(()=>{const q=matchMedia('(max-width:720px)');const update=()=>setMobile(q.matches);update();q.addEventListener('change',update);return()=>q.removeEventListener('change',update);},[]);
  useEffect(()=>{
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()),
      fetch(`${base}/data/territory/archive/manifest.json`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()),
      fetch(`${base}/data/territory/hydro/rivers_50m.geojson`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.ok?r.json():null),
    ]).then(([a,b,c])=>{if(controller.signal.aborted)return;setIndex(a);setManifest(b);if(c)setRivers(c);}).catch(()=>{});return()=>controller.abort();
  },[]);
  useEffect(()=>{
    const snapshot=snapshotAt(index,year);if(!snapshot||worldFile.current===snapshot.file)return;worldFile.current=snapshot.file;
    const cached=worldCache.current.get(snapshot.file);if(cached){setWorld(cached);setWorldYear(snapshot.year);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()).then(data=>{worldCache.current.set(snapshot.file,data);if(!controller.signal.aborted){setWorld(data);setWorldYear(snapshot.year);}}).catch(()=>{worldFile.current=null;});return()=>controller.abort();
  },[index,year]);
  useEffect(()=>{
    const entry=manifest?.polities?.find((i:any)=>i.polity_id===period.polityId&&i.file&&i.features>0);if(!entry?.file){setRussia(null);return;}
    const cached=russiaCache.current.get(entry.file);if(cached){setRussia(cached);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'',controller=new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`,{signal:controller.signal,cache:'force-cache'}).then(r=>r.json()).then(data=>{russiaCache.current.set(entry.file,data);if(!controller.signal.aborted)setRussia(data);}).catch(()=>{});return()=>controller.abort();
  },[manifest,period.polityId]);

  const updateMarkerVisibility=useCallback(()=>{
    const map=mapRef.current;if(!map)return;const z=map.getZoom();
    const countryLimit=z<3.45?38:z<4.7?85:180;
    for(const item of countryMarkers.current)item.element.style.display=item.rank<countryLimit?'block':'none';
    for(const item of placeMarkers.current){const show=item.kind==='capital'?z>=3.55:z>=5.15;item.element.style.display=show?'block':'none';}
  },[]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;let alive=true;const initial=territoryPeriodAt(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
    const map=new MapLibreMap({container:host,style:baseStyle(),center:initial.focus,zoom:window.innerWidth<=720?2.35:3.02,minZoom:1.05,maxZoom:12,pitch:0,bearing:0,attributionControl:false,renderWorldCopies:false,canvasContextAttributes:{antialias:true}});
    mapRef.current=map;map.scrollZoom.setWheelZoomRate(1/460);map.dragRotate.disable();map.touchZoomRotate.disableRotation();
    map.on('style.load',()=>{if(!alive)return;map.setProjection({type:'globe'});map.resize();setReady(true);});
    map.on('zoom',updateMarkerVisibility);
    const onFullscreen=()=>{setFullscreen(Boolean(document.fullscreenElement));requestAnimationFrame(()=>map.resize());};document.addEventListener('fullscreenchange',onFullscreen);
    return()=>{alive=false;document.removeEventListener('fullscreenchange',onFullscreen);countryMarkers.current.forEach(i=>i.marker.remove());placeMarkers.current.forEach(i=>i.marker.remove());map.remove();mapRef.current=null;};
  },[initialYear,updateMarkerVisibility]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    (map.getSource('world')as any)?.setData(worldFill(world));(map.getSource('worldBorders')as any)?.setData(borderLines(world));
    countryMarkers.current.forEach(i=>i.marker.remove());countryMarkers.current=[];
    countryAnchors(world).forEach((item:any,rank:number)=>{const element=document.createElement('div');element.textContent=item.name;styleMarker(element,'country');const marker=new Marker({element,anchor:'center'}).setLngLat(item.centroid).addTo(map);countryMarkers.current.push({marker,element,rank,kind:'country'});});
    updateMarkerVisibility();
  },[world,ready,updateMarkerVisibility]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;const collection={type:'FeatureCollection',features:russiaFeatures.map((f:any)=>({...f,geometry:rewindGeometry(f.geometry)}))};(map.getSource('russia')as any)?.setData(collection);(map.getSource('russiaBorders')as any)?.setData(borderLines({type:'FeatureCollection',features:russiaFeatures}));},[russiaFeatures,ready]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;(map.getSource('rivers')as any)?.setData(riversForMap(rivers));},[rivers,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;placeMarkers.current.forEach(i=>i.marker.remove());placeMarkers.current=[];
    activePlaces.forEach((place,index)=>{const element=document.createElement('div');element.textContent=place.kind==='capital'?`★ ${place.name}`:`• ${place.name}`;styleMarker(element,place.kind);const marker=new Marker({element,anchor:'left'}).setLngLat([place.lon,place.lat]).addTo(map);placeMarkers.current.push({marker,element,rank:index,kind:place.kind});});updateMarkerVisibility();
  },[activePlaces,ready,updateMarkerVisibility]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    if(mode==='states'){
      map.setPaintProperty('world-fill','fill-opacity',0.82);map.setPaintProperty('russia-fill','fill-opacity',0.88);map.setPaintProperty('world-border','line-opacity',1);map.setPaintProperty('world-border','line-width',['interpolate',['linear'],['zoom'],1,1.45,3,1.8,6,2.4,10,3]);map.setPaintProperty('terrain','raster-opacity',0.32);map.setPaintProperty('hillshade','raster-opacity',0.28);
    }else if(mode==='borders'){
      map.setPaintProperty('world-fill','fill-opacity',0.20);map.setPaintProperty('russia-fill','fill-opacity',0.34);map.setPaintProperty('world-border','line-opacity',1);map.setPaintProperty('world-border','line-width',['interpolate',['linear'],['zoom'],1,1.9,3,2.3,6,3,10,3.8]);map.setPaintProperty('terrain','raster-opacity',0.46);map.setPaintProperty('hillshade','raster-opacity',0.42);
    }else{
      map.setPaintProperty('world-fill','fill-opacity',0.48);map.setPaintProperty('russia-fill','fill-opacity',0.62);map.setPaintProperty('world-border','line-opacity',0.96);map.setPaintProperty('world-border','line-width',['interpolate',['linear'],['zoom'],1,1.25,3,1.55,6,2.1,10,2.8]);map.setPaintProperty('terrain','raster-opacity',0.58);map.setPaintProperty('hillshade','raster-opacity',0.50);
    }
  },[mode,ready]);
  useEffect(()=>{const map=mapRef.current;if(!map||!ready)return;map.setProjection({type:projection==='globe'?'globe':'mercator'});map.easeTo({pitch:0,bearing:0,duration:260});},[projection,ready]);

  const focusRussia=useCallback(()=>{const map=mapRef.current;if(map)map.easeTo({center:period.focus,zoom:mobile?2.35:3.02,pitch:0,bearing:0,duration:480});},[period.focus,mobile]);
  const zoom=useCallback((delta:number)=>{const map=mapRef.current;if(map)map.easeTo({zoom:clamp(map.getZoom()+delta,1.05,12),duration:180});},[]);
  const toggleFullscreen=useCallback(async()=>{const scene=sceneRef.current;if(!scene)return;if(document.fullscreenElement)await document.exitFullscreen();else await scene.requestFullscreen();},[]);
  const scrollToYear=useCallback((next:number,behavior:ScrollBehavior='smooth')=>{const el=timelineRef.current;if(!el)return;const target=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);el.scrollTo({left:(target-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(target);},[]);
  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[initialYear,scrollToYear]);
  function onTimelineScroll(){if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);scrollFrame.current=requestAnimationFrame(()=>{scrollFrame.current=null;const el=timelineRef.current;if(!el)return;const next=clamp(Math.round(TERRITORY_MIN_YEAR+el.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);setYear(prev=>prev===next?prev:next);});}
  function onTimelineWheel(event:React.WheelEvent<HTMLElement>){const el=timelineRef.current;if(!el)return;const raw=Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX;if(!raw)return;event.preventDefault();el.scrollLeft+=raw*.72;}
  function jump(direction:number){const candidates=direction>0?snapshots.filter(v=>v>year):snapshots.filter(v=>v<year).reverse();if(candidates.length)scrollToYear(candidates[0]);}

  return <main className={styles.page}><section ref={sceneRef} className={styles.scene}>
    <div className={styles.space}/><div ref={hostRef} className={`${styles.globeHost} ${styles.mapLibreHost}`}/>
    <header className={styles.topbar}><div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div><div className={styles.topActions}><div className={styles.modeGroup}>
      <button className={mode==='relief'?styles.active:''} onClick={()=>setMode('relief')}>Рельеф</button>
      <button className={mode==='borders'?styles.active:''} onClick={()=>setMode('borders')}>Границы</button>
      <button className={mode==='states'?styles.active:''} onClick={()=>setMode('states')}>Государства</button>
    </div><button className={styles.projectionToggle} onClick={()=>setProjection(v=>v==='globe'?'map':'globe')}>{projection==='globe'?'Карта':'Глобус'}</button><button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button></div></header>
    <aside className={styles.story}><small>{period.era}</small><div><h1>{period.label}</h1><b>{year}</b></div><p>Исторический мировой срез {worldYear??'—'} года · рельеф, границы государств, гидрография и масштабные подписи</p></aside>
    <div className={styles.zoomTools}><button onClick={()=>zoom(.85)}>+</button><button onClick={()=>zoom(-.85)}>−</button><button onClick={focusRussia}>◎</button></div>
    <section className={styles.timeline} onWheel={onTimelineWheel}><div className={styles.timelineHead}><button onClick={()=>jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div><b>{year}</b><button onClick={()=>jump(1)}>›</button></div><div className={styles.rulerWrap}><div className={styles.centerNeedle}/><div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}><div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{ticks.map(value=><i key={value} className={`${styles.tick} ${value%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{value%50===0?<span>{value}</span>:null}</i>)}{POLITY_TRANSITION_YEARS.map(value=><i key={`e-${value}`} className={styles.eventTick} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}</div></div></div></section>
  </section></main>;
}
