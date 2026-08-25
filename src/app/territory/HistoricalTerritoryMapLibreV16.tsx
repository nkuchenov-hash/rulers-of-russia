'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Map as MapLibreMap} from 'maplibre-gl';
import {
  POLITY_TRANSITION_YEARS,
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt,
} from './territoryChronology';
import {TERRITORY_PLACES} from './territoryPlaces';
import styles from './territory-webgl.module.css';

const YEAR_PX = 6;
const ESRI_TERRAIN = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_HILLSHADE = 'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}';
const RIVERS_50M = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@ca96624a/geojson/ne_50m_rivers_lake_centerlines.geojson';
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const EMPTY_COLLECTION:any = {type:'FeatureCollection',features:[]};
const COUNTRY_PALETTE = [
  '#8c665e','#70805b','#66768f','#98734e','#557982','#80694f','#5f7967',
  '#805f6e','#6b6084','#5d7978','#8f654a','#6d7a50','#7c6580','#87755c',
];

type ViewMode = 'relief' | 'states';
type ProjectionMode = 'globe' | 'map';
type Point = [number,number];
type HistoricalData = {
  index:any;
  world:any;
  worldYear:number|null;
  russia:any;
  rivers:any;
};

const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
const normalizeLon = (lon:number) => {
  let value = lon;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
};
const yearPart = (value:unknown) => {
  const match = String(value ?? '').match(/-?\d{3,4}/);
  return match ? Number(match[0]) : null;
};

function unwrapRing(ring:any[]):Point[] {
  if (!Array.isArray(ring) || ring.length === 0) return [];
  const first:Point = [Number(ring[0][0]),Number(ring[0][1])];
  const output:Point[] = [first];
  let previous = first[0];
  for (let index=1;index<ring.length;index++) {
    let lon = Number(ring[index][0]);
    const lat = Number(ring[index][1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    while (lon-previous > 180) lon -= 360;
    while (lon-previous < -180) lon += 360;
    output.push([lon,lat]);
    previous = lon;
  }
  return output;
}

function signedRingArea(ring:any[]):number {
  const points = unwrapRing(ring);
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    sum += points[j][0]*points[i][1] - points[i][0]*points[j][1];
  }
  return sum/2;
}

function rewindRing(ring:any[],wantCounterClockwise:boolean) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  const area = signedRingArea(ring);
  if (!Number.isFinite(area) || Math.abs(area) < 1e-10) return ring;
  const isCounterClockwise = area > 0;
  return isCounterClockwise === wantCounterClockwise ? ring : [...ring].reverse();
}

// RFC 7946 / MapLibre right-hand rule: exterior rings CCW, holes CW.
// Historical Basemaps is D3-oriented (the opposite for small polygons), so
// every polygon must be normalized explicitly before it reaches MapLibre.
function rewindGeometryForMap(geometry:any) {
  if (geometry?.type === 'Polygon') {
    return {
      ...geometry,
      coordinates:(geometry.coordinates ?? []).map((ring:any[],index:number) => rewindRing(ring,index===0)),
    };
  }
  if (geometry?.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates:(geometry.coordinates ?? []).map((polygon:any[]) =>
        polygon.map((ring:any[],index:number) => rewindRing(ring,index===0))
      ),
    };
  }
  return geometry;
}

function featureForMap(feature:any) {
  if (!feature?.geometry) return feature;
  return {...feature,geometry:rewindGeometryForMap(feature.geometry)};
}

function ringCentroidAndArea(ring:any[]) {
  const points = unwrapRing(ring);
  if (points.length < 3) return {centroid:[0,0] as Point,area:0};
  let crossSum = 0;
  let cx = 0;
  let cy = 0;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const cross = points[j][0]*points[i][1]-points[i][0]*points[j][1];
    crossSum += cross;
    cx += (points[j][0]+points[i][0])*cross;
    cy += (points[j][1]+points[i][1])*cross;
  }
  const signedArea = crossSum/2;
  if (Math.abs(signedArea) < 1e-10) {
    const avg = points.reduce((acc,point) => [acc[0]+point[0],acc[1]+point[1]] as Point,[0,0]);
    return {centroid:[normalizeLon(avg[0]/points.length),avg[1]/points.length] as Point,area:0};
  }
  return {
    centroid:[normalizeLon(cx/(6*signedArea)),cy/(6*signedArea)] as Point,
    area:Math.abs(signedArea),
  };
}

function labelAnchor(feature:any) {
  const geometry = rewindGeometryForMap(feature?.geometry);
  if (!geometry) return null;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : [];
  let best:{centroid:Point;area:number}|null = null;
  let totalArea = 0;
  for (const polygon of polygons) {
    const outer = polygon?.[0];
    if (!outer) continue;
    const metric = ringCentroidAndArea(outer);
    totalArea += metric.area;
    if (!best || metric.area > best.area) best = metric;
  }
  if (!best || !Number.isFinite(best.centroid[0]) || !Number.isFinite(best.centroid[1])) return null;
  return {centroid:best.centroid,area:totalArea};
}

function featureName(feature:any) {
  const props = feature?.properties ?? {};
  return [
    props.NAME_RU,props.name_ru,props.RU_NAME,props.NAME,props.name,props.ADMIN,
    props.entity,props.polity,props.ABBREVN,props.SUBJECTO,props.PARTOF,
  ].find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
}

function countryColor(feature:any,index:number) {
  const name = featureName(feature);
  let hash = 31+index*17;
  for (let i=0;i<name.length;i++) hash=((hash<<5)-hash+name.charCodeAt(i))|0;
  return COUNTRY_PALETTE[Math.abs(hash)%COUNTRY_PALETTE.length];
}

function validAt(feature:any,year:number) {
  const start=yearPart(feature?.properties?.start_date);
  const end=yearPart(feature?.properties?.end_date);
  return (start===null||year>=start)&&(end===null||year<=end);
}

function selectRussia(collection:any,year:number) {
  if (!collection?.features?.length) return [];
  const exact=collection.features.filter((feature:any)=>validAt(feature,year));
  if (exact.length) return exact;
  const previous=collection.features
    .map((feature:any)=>({feature,start:yearPart(feature.properties?.start_date)}))
    .filter((item:any)=>item.start!==null&&item.start<=year)
    .sort((a:any,b:any)=>b.start-a.start);
  if (!previous.length) return [];
  return previous.filter((item:any)=>item.start===previous[0].start).map((item:any)=>item.feature);
}

function snapshotAt(index:any,year:number) {
  const snapshots=[...(index?.snapshots??[])].sort((a:any,b:any)=>a.year-b.year);
  if (!snapshots.length) return null;
  let selected=snapshots[0];
  for (const snapshot of snapshots) {
    if (snapshot.year<=year) selected=snapshot;
    else break;
  }
  return selected;
}

function worldForMap(world:any) {
  if (!world?.features) return EMPTY_COLLECTION;
  return {
    type:'FeatureCollection',
    features:world.features.filter((feature:any)=>feature?.geometry).map((sourceFeature:any,index:number)=>{
      const feature=featureForMap(sourceFeature);
      return {
        ...feature,
        properties:{
          ...(feature.properties??{}),
          __name:featureName(feature),
          __color:countryColor(feature,index),
        },
      };
    }),
  };
}

function russiaForMap(features:any[]) {
  return {type:'FeatureCollection',features:(features??[]).map(featureForMap)};
}

function countryLabels(world:any) {
  if (!world?.features) return EMPTY_COLLECTION;
  const candidates:any[]=[];
  for (const feature of world.features) {
    const name=featureName(feature);
    if (!name) continue;
    const anchor=labelAnchor(feature);
    if (!anchor||anchor.area<0.015) continue;
    candidates.push({name,...anchor});
  }
  candidates.sort((a,b)=>b.area-a.area);
  return {
    type:'FeatureCollection',
    features:candidates.slice(0,180).map((item,index)=>({
      type:'Feature',
      geometry:{type:'Point',coordinates:item.centroid},
      properties:{
        name:item.name,
        size:clamp(11.5+Math.log10(1+item.area)*4.6,12,18.5),
        priority:index,
      },
    })),
  };
}

function placesForMap(places:any[],kind:'capital'|'regional') {
  return {
    type:'FeatureCollection',
    features:places.filter((place)=>place.kind===kind).map((place)=>({
      type:'Feature',
      geometry:{type:'Point',coordinates:[place.lon,place.lat]},
      properties:{name:place.name,kind:place.kind},
    })),
  };
}

function riversForMap(rivers:any) {
  if (!rivers?.features) return EMPTY_COLLECTION;
  return {
    type:'FeatureCollection',
    features:rivers.features.map((feature:any)=>{
      const rank=Number(feature?.properties?.scalerank);
      const tier=Number.isFinite(rank)&&rank<=3?0:Number.isFinite(rank)&&rank<=6?1:2;
      return {...feature,properties:{...(feature.properties??{}),__tier:tier}};
    }),
  };
}

function useHistoricalData(year:number,polityId:string):HistoricalData {
  const [index,setIndex]=useState<any>(null);
  const [manifest,setManifest]=useState<any>(null);
  const [world,setWorld]=useState<any>(null);
  const [worldYear,setWorldYear]=useState<number|null>(null);
  const [russia,setRussia]=useState<any>(null);
  const [rivers,setRivers]=useState<any>(null);
  const worldCache=useRef(new Map<string,any>());
  const russiaCache=useRef(new Map<string,any>());
  const worldFile=useRef<string|null>(null);

  useEffect(()=>{
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
    const controller=new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`,{signal:controller.signal,cache:'force-cache'}).then((response)=>{
        if(!response.ok) throw new Error(`world index ${response.status}`);
        return response.json();
      }),
      fetch(`${base}/data/territory/archive/manifest.json`,{signal:controller.signal,cache:'force-cache'}).then((response)=>{
        if(!response.ok) throw new Error(`manifest ${response.status}`);
        return response.json();
      }),
    ]).then(([nextIndex,nextManifest])=>{
      if(controller.signal.aborted) return;
      setIndex(nextIndex);
      setManifest(nextManifest);
    }).catch(()=>{});

    fetch(RIVERS_50M,{signal:controller.signal,cache:'force-cache'})
      .then((response)=>response.ok?response.json():null)
      .then((data)=>{if(!controller.signal.aborted&&data)setRivers(data);})
      .catch(()=>{});
    return()=>controller.abort();
  },[]);

  useEffect(()=>{
    const snapshot=snapshotAt(index,year);
    if(!snapshot||worldFile.current===snapshot.file)return;
    worldFile.current=snapshot.file;
    const cached=worldCache.current.get(snapshot.file);
    if(cached){setWorld(cached);setWorldYear(snapshot.year);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
    const controller=new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`,{signal:controller.signal,cache:'force-cache'})
      .then((response)=>{if(!response.ok)throw new Error(`world ${response.status}`);return response.json();})
      .then((data)=>{
        worldCache.current.set(snapshot.file,data);
        if(!controller.signal.aborted){setWorld(data);setWorldYear(snapshot.year);}
      })
      .catch(()=>{if(worldFile.current===snapshot.file)worldFile.current=null;});
    return()=>controller.abort();
  },[index,year]);

  useEffect(()=>{
    const entry=manifest?.polities?.find((item:any)=>item.polity_id===polityId&&item.file&&item.features>0);
    if(!entry?.file){setRussia(null);return;}
    const cached=russiaCache.current.get(entry.file);
    if(cached){setRussia(cached);return;}
    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
    const controller=new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`,{signal:controller.signal,cache:'force-cache'})
      .then((response)=>{if(!response.ok)throw new Error(`russia ${response.status}`);return response.json();})
      .then((data)=>{russiaCache.current.set(entry.file,data);if(!controller.signal.aborted)setRussia(data);})
      .catch(()=>{});
    return()=>controller.abort();
  },[manifest,polityId]);

  return {index,world,worldYear,russia,rivers};
}

function baseStyle():any {
  return {
    version:8,
    glyphs:GLYPHS,
    sources:{
      terrainBase:{type:'raster',tiles:[ESRI_TERRAIN],tileSize:256,minzoom:0,maxzoom:13},
      hillshadeBase:{type:'raster',tiles:[ESRI_HILLSHADE],tileSize:256,minzoom:0,maxzoom:15},
      world:{type:'geojson',data:EMPTY_COLLECTION},
      russia:{type:'geojson',data:EMPTY_COLLECTION},
      rivers:{type:'geojson',data:EMPTY_COLLECTION},
      countryLabels:{type:'geojson',data:EMPTY_COLLECTION},
      capitals:{type:'geojson',data:EMPTY_COLLECTION},
      cities:{type:'geojson',data:EMPTY_COLLECTION},
    },
    layers:[
      {id:'ocean',type:'background',paint:{'background-color':'#59696d'}},
      {id:'terrain-base',type:'raster',source:'terrainBase',paint:{
        'raster-opacity':1,'raster-saturation':-0.38,'raster-contrast':0.26,
        'raster-brightness-min':0.04,'raster-brightness-max':0.70,'raster-fade-duration':80,
      }},
      {id:'hillshade-base',type:'raster',source:'hillshadeBase',paint:{
        'raster-opacity':0.43,'raster-saturation':-1,'raster-contrast':0.38,
        'raster-brightness-min':0.03,'raster-brightness-max':0.72,'raster-fade-duration':80,
      }},
      {id:'world-fill',type:'fill',source:'world',paint:{
        'fill-color':['coalesce',['get','__color'],'#746d5d'],'fill-opacity':0.34,
      }},
      {id:'russia-fill',type:'fill',source:'russia',paint:{'fill-color':'#95885c','fill-opacity':0.42}},
      {id:'world-border',type:'line',source:'world',paint:{
        'line-color':'#202729','line-opacity':0.94,
        'line-width':['interpolate',['linear'],['zoom'],1,1.15,3,1.6,6,2.15,10,2.7],
      }},
      {id:'russia-border',type:'line',source:'russia',paint:{
        'line-color':'#d2ad4f','line-opacity':1,
        'line-width':['interpolate',['linear'],['zoom'],1,2.1,3,2.8,6,3.6,10,4.6],
      }},
      {id:'rivers',type:'line',source:'rivers',layout:{'line-cap':'round','line-join':'round'},paint:{
        'line-color':['match',['get','__tier'],0,'#315e73',1,'#47778b','#648d9c'],
        'line-opacity':['match',['get','__tier'],0,1,1,0.9,0.72],
        'line-width':['interpolate',['linear'],['zoom'],
          1,['match',['get','__tier'],0,1.05,1,0.62,0.3],
          5,['match',['get','__tier'],0,2.1,1,1.15,0.58],
          9,['match',['get','__tier'],0,3.8,1,2.1,1.08],
          12,['match',['get','__tier'],0,5.3,1,3.1,1.6],
        ],
      }},
      {id:'country-labels',type:'symbol',source:'countryLabels',minzoom:0.9,maxzoom:7.5,layout:{
        'text-field':['get','name'],'text-font':['Open Sans Regular'],
        'text-size':['interpolate',['linear'],['zoom'],0.9,['get','size'],5,['*',['get','size'],1.08]],
        'text-letter-spacing':0.025,'text-max-width':10,'text-allow-overlap':false,
        'text-ignore-placement':false,'symbol-sort-key':['get','priority'],
      },paint:{
        'text-color':'#171d1f','text-halo-color':'rgba(239,232,211,0.96)',
        'text-halo-width':1.8,'text-halo-blur':0.35,'text-opacity':1,
      }},
      {id:'capital-labels',type:'symbol',source:'capitals',minzoom:4.15,layout:{
        'text-field':['concat','★ ',['get','name']],'text-font':['Open Sans Regular'],
        'text-size':['interpolate',['linear'],['zoom'],4.15,13,8,15.5,11,17.5],
        'text-offset':[0.55,0],'text-anchor':'left','text-allow-overlap':false,'text-ignore-placement':false,
      },paint:{
        'text-color':'#654914','text-halo-color':'rgba(245,237,214,0.97)','text-halo-width':1.8,'text-opacity':1,
      }},
      {id:'city-labels',type:'symbol',source:'cities',minzoom:6.1,layout:{
        'text-field':['concat','• ',['get','name']],'text-font':['Open Sans Regular'],
        'text-size':['interpolate',['linear'],['zoom'],6.1,12.5,10,15,12,16.5],
        'text-offset':[0.5,0],'text-anchor':'left','text-allow-overlap':false,'text-ignore-placement':false,
      },paint:{
        'text-color':'#20292c','text-halo-color':'rgba(245,238,217,0.96)','text-halo-width':1.6,'text-opacity':1,
      }},
    ],
  };
}

export function HistoricalTerritoryMapLibreV16({initialYear=TERRITORY_MAX_YEAR}:{initialYear?:number}) {
  const sceneRef=useRef<HTMLElement|null>(null);
  const hostRef=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MapLibreMap|null>(null);
  const timelineRef=useRef<HTMLDivElement|null>(null);
  const scrollFrame=useRef<number|null>(null);
  const [ready,setReady]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const [year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
  const [mode,setMode]=useState<ViewMode>('relief');
  const [projection,setProjection]=useState<ProjectionMode>('globe');

  const period=territoryPeriodAt(year);
  const {index,world,worldYear,russia,rivers}=useHistoricalData(year,period.polityId);
  const russiaFeatures=useMemo(()=>selectRussia(russia,year),[russia,year]);
  const activePlaces=useMemo(()=>TERRITORY_PLACES.filter((place)=>(place.from??TERRITORY_MIN_YEAR)<=year&&(place.to??TERRITORY_MAX_YEAR)>=year),[year]);
  const snapshots=useMemo(()=>{
    const years=new Set<number>(POLITY_TRANSITION_YEARS);
    for(const snapshot of index?.snapshots??[])years.add(snapshot.year);
    years.add(TERRITORY_MAX_YEAR);
    return [...years].filter((value)=>value>=TERRITORY_MIN_YEAR&&value<=TERRITORY_MAX_YEAR).sort((a,b)=>a-b);
  },[index]);
  const ticks=useMemo(()=>{
    const values:number[]=[];
    for(let value=Math.ceil(TERRITORY_MIN_YEAR/10)*10;value<=TERRITORY_MAX_YEAR;value+=10)values.push(value);
    return values;
  },[]);

  useEffect(()=>{
    const query=matchMedia('(max-width:720px)');
    const update=()=>setMobile(query.matches);
    update();query.addEventListener('change',update);
    return()=>query.removeEventListener('change',update);
  },[]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;
    let alive=true;
    const initial=territoryPeriodAt(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
    const map=new MapLibreMap({
      container:host,style:baseStyle(),center:initial.focus,
      zoom:window.innerWidth<=720?2.25:2.85,minZoom:1.05,maxZoom:12,
      pitch:0,bearing:0,attributionControl:false,renderWorldCopies:false,
      canvasContextAttributes:{antialias:true},
    });
    mapRef.current=map;
    map.scrollZoom.setWheelZoomRate(1/460);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.on('style.load',()=>{
      if(!alive)return;
      map.setProjection({type:'globe'});
      map.resize();
      setReady(true);
    });
    const onFullscreen=()=>{setFullscreen(Boolean(document.fullscreenElement));requestAnimationFrame(()=>map.resize());};
    document.addEventListener('fullscreenchange',onFullscreen);
    return()=>{alive=false;document.removeEventListener('fullscreenchange',onFullscreen);map.remove();mapRef.current=null;};
  },[initialYear]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    (map.getSource('world')as any)?.setData(worldForMap(world));
    (map.getSource('countryLabels')as any)?.setData(countryLabels(world));
  },[world,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    (map.getSource('russia')as any)?.setData(russiaForMap(russiaFeatures));
  },[russiaFeatures,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    (map.getSource('rivers')as any)?.setData(riversForMap(rivers));
  },[rivers,ready]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    (map.getSource('capitals')as any)?.setData(placesForMap(activePlaces,'capital'));
    (map.getSource('cities')as any)?.setData(placesForMap(activePlaces,'regional'));
  },[activePlaces,ready]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    if(mode==='states'){
      map.setPaintProperty('world-fill','fill-opacity',0.74);
      map.setPaintProperty('world-border','line-opacity',1);
      map.setPaintProperty('hillshade-base','raster-opacity',0.22);
      map.setPaintProperty('terrain-base','raster-opacity',0.66);
      map.setPaintProperty('terrain-base','raster-saturation',-0.48);
      map.setPaintProperty('russia-fill','fill-opacity',0.58);
    }else{
      map.setPaintProperty('world-fill','fill-opacity',0.34);
      map.setPaintProperty('world-border','line-opacity',0.94);
      map.setPaintProperty('hillshade-base','raster-opacity',0.43);
      map.setPaintProperty('terrain-base','raster-opacity',1);
      map.setPaintProperty('terrain-base','raster-saturation',-0.38);
      map.setPaintProperty('russia-fill','fill-opacity',0.42);
    }
  },[mode,ready]);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!ready)return;
    map.setProjection({type:projection==='globe'?'globe':'mercator'});
    map.easeTo({pitch:0,bearing:0,duration:280});
  },[projection,ready]);

  const focusRussia=useCallback(()=>{
    const map=mapRef.current;if(!map)return;
    map.easeTo({center:period.focus,zoom:mobile?2.25:2.85,pitch:0,bearing:0,duration:520});
  },[period.focus,mobile]);
  const zoom=useCallback((delta:number)=>{
    const map=mapRef.current;if(!map)return;
    map.easeTo({zoom:clamp(map.getZoom()+delta,1.05,12),duration:200});
  },[]);
  const toggleFullscreen=useCallback(async()=>{
    const scene=sceneRef.current;if(!scene)return;
    if(document.fullscreenElement)await document.exitFullscreen();else await scene.requestFullscreen();
  },[]);
  const scrollToYear=useCallback((next:number,behavior:ScrollBehavior='smooth')=>{
    const element=timelineRef.current;if(!element)return;
    const target=clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);
    element.scrollTo({left:(target-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});setYear(target);
  },[]);

  useEffect(()=>{requestAnimationFrame(()=>scrollToYear(initialYear,'auto'));},[initialYear,scrollToYear]);
  function onTimelineScroll(){
    if(scrollFrame.current)cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current=requestAnimationFrame(()=>{
      scrollFrame.current=null;const element=timelineRef.current;if(!element)return;
      const next=clamp(Math.round(TERRITORY_MIN_YEAR+element.scrollLeft/YEAR_PX),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);
      setYear((previous)=>previous===next?previous:next);
    });
  }
  function onTimelineWheel(event:React.WheelEvent<HTMLElement>){
    const element=timelineRef.current;if(!element)return;
    const raw=Math.abs(event.deltaY)>=Math.abs(event.deltaX)?event.deltaY:event.deltaX;if(!raw)return;
    event.preventDefault();element.scrollLeft+=raw*0.72;
  }
  function jump(direction:number){
    const candidates=direction>0?snapshots.filter((value)=>value>year):snapshots.filter((value)=>value<year).reverse();
    if(candidates.length)scrollToYear(candidates[0]);
  }

  return (
    <main className={styles.page}>
      <section ref={sceneRef} className={styles.scene}>
        <div className={styles.space}/>
        <div ref={hostRef} className={`${styles.globeHost} ${styles.mapLibreHost}`}/>
        <header className={styles.topbar}>
          <div className={styles.brand}><span>Р</span><strong>Правители<br/>России</strong></div>
          <div className={styles.topActions}>
            <div className={styles.modeGroup}>
              <button className={mode==='relief'?styles.active:''} onClick={()=>setMode('relief')}>Рельеф</button>
              <button className={mode==='states'?styles.active:''} onClick={()=>setMode('states')}>Государства</button>
            </div>
            <button className={styles.projectionToggle} onClick={()=>setProjection((value)=>value==='globe'?'map':'globe')}>
              {projection==='globe'?'Карта':'Глобус'}
            </button>
            <button onClick={toggleFullscreen}>{fullscreen?'Свернуть':'На весь экран'}</button>
          </div>
        </header>
        <aside className={styles.story}>
          <small>{period.era}</small>
          <div><h1>{period.label}</h1><b>{year}</b></div>
          <p>Исторический мировой срез {worldYear??'—'} года · рельеф, границы государств, гидрография и масштабные подписи</p>
        </aside>
        <div className={styles.zoomTools}>
          <button onClick={()=>zoom(0.85)}>+</button><button onClick={()=>zoom(-0.85)}>−</button><button onClick={focusRussia}>◎</button>
        </div>
        <section className={styles.timeline} onWheel={onTimelineWheel}>
          <div className={styles.timelineHead}>
            <button onClick={()=>jump(-1)}>‹</button>
            <div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div>
            <b>{year}</b><button onClick={()=>jump(1)}>›</button>
          </div>
          <div className={styles.rulerWrap}>
            <div className={styles.centerNeedle}/>
            <div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}>
              <div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>
                {ticks.map((value)=><i key={value} className={`${styles.tick} ${value%50===0?styles.majorTick:''}`} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>{value%50===0?<span>{value}</span>:null}</i>)}
                {POLITY_TRANSITION_YEARS.map((value)=><i key={`e-${value}`} className={styles.eventTick} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>)}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
