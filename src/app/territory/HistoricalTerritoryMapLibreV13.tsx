'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {geoArea,geoCentroid} from 'd3-geo';
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
const TWO_PI = Math.PI * 2;
const MAX_FEATURE_AREA = 2.2;
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
const COUNTRY_PALETTE = [
  '#9b7168','#879466','#7c88a5','#b28b5d','#668e96','#957b5c','#6f9079',
  '#986f7d','#7e70a0','#708f8e','#a77a58','#7c915d','#92779a','#a08869',
];
const EMPTY_COLLECTION = {type:'FeatureCollection',features:[]} as const;

type ViewMode = 'relief' | 'states';
type ProjectionMode = 'globe' | 'map';

type HistoricalData = {
  index: any;
  world: any;
  worldYear: number | null;
  russia: any;
  rivers: any;
};

const clamp = (value:number,min:number,max:number) => Math.min(max,Math.max(min,value));
const yearPart = (value:unknown) => {
  const match = String(value ?? '').match(/-?\d{3,4}/);
  return match ? Number(match[0]) : null;
};
const reverseRing = (ring:any[]) => [...ring].reverse();

function normalizeFeature(feature:any) {
  if (!feature?.geometry || !['Polygon','MultiPolygon'].includes(feature.geometry.type)) return null;
  let normalized = feature;
  if (geoArea(normalized) > TWO_PI) {
    const geometry = feature.geometry.type === 'Polygon'
      ? {type:'Polygon',coordinates:feature.geometry.coordinates.map(reverseRing)}
      : {type:'MultiPolygon',coordinates:feature.geometry.coordinates.map((polygon:any[]) => polygon.map(reverseRing))};
    normalized = {...feature,geometry};
  }
  const area = geoArea(normalized);
  return Number.isFinite(area) && area > 0 && area <= MAX_FEATURE_AREA ? normalized : null;
}

function normalizeCollection(collection:any) {
  return {
    ...collection,
    features:(collection?.features ?? []).map(normalizeFeature).filter(Boolean),
  };
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
  let hash = 29 + index * 19;
  for (let i=0;i<name.length;i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return COUNTRY_PALETTE[Math.abs(hash) % COUNTRY_PALETTE.length];
}

function validAt(feature:any,year:number) {
  const start = yearPart(feature?.properties?.start_date);
  const end = yearPart(feature?.properties?.end_date);
  return (start === null || year >= start) && (end === null || year <= end);
}

function selectRussia(collection:any,year:number) {
  if (!collection?.features?.length) return [];
  const exact = collection.features.filter((feature:any) => validAt(feature,year));
  if (exact.length) return exact;
  const previous = collection.features
    .map((feature:any) => ({feature,start:yearPart(feature.properties?.start_date)}))
    .filter((item:any) => item.start !== null && item.start <= year)
    .sort((a:any,b:any) => b.start - a.start);
  if (!previous.length) return [];
  return previous.filter((item:any) => item.start === previous[0].start).map((item:any) => item.feature);
}

function snapshotAt(index:any,year:number) {
  const snapshots = index?.snapshots ?? [];
  if (!snapshots.length) return null;
  let snapshot = snapshots[0];
  for (const item of snapshots) {
    if (item.year <= year) snapshot = item;
    else break;
  }
  return snapshot;
}

function worldForMap(world:any) {
  if (!world?.features) return EMPTY_COLLECTION;
  return {
    type:'FeatureCollection',
    features:world.features.map((feature:any,index:number) => ({
      ...feature,
      properties:{
        ...(feature.properties ?? {}),
        __name:featureName(feature),
        __color:countryColor(feature,index),
      },
    })),
  };
}

function russiaForMap(features:any[]) {
  return {type:'FeatureCollection',features:features ?? []};
}

function countryLabels(world:any) {
  if (!world?.features) return EMPTY_COLLECTION;
  const ranked = world.features
    .map((feature:any) => ({feature,area:geoArea(feature)}))
    .filter((item:any) => Number.isFinite(item.area) && item.area > 0.00015)
    .sort((a:any,b:any) => b.area - a.area)
    .slice(0,150);

  return {
    type:'FeatureCollection',
    features:ranked.map(({feature,area}:any,index:number) => {
      const centroid = geoCentroid(feature);
      const size = clamp(10.5 + Math.sqrt(area) * 15,11,18);
      return {
        type:'Feature',
        geometry:{type:'Point',coordinates:centroid},
        properties:{
          name:featureName(feature),
          size,
          priority:index,
          area,
        },
      };
    }).filter((feature:any) => feature.properties.name),
  };
}

function placesForMap(places:any[],kind:'capital'|'regional') {
  return {
    type:'FeatureCollection',
    features:places
      .filter((place) => place.kind === kind)
      .map((place) => ({
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
    features:rivers.features.map((feature:any) => {
      const rank = Number(feature?.properties?.scalerank);
      const tier = Number.isFinite(rank) && rank <= 4 ? 0 : Number.isFinite(rank) && rank <= 6 ? 1 : 2;
      return {
        ...feature,
        properties:{...(feature.properties ?? {}),__tier:tier},
      };
    }),
  };
}

function useHistoricalData(year:number,polityId:string):HistoricalData {
  const [index,setIndex] = useState<any>(null);
  const [manifest,setManifest] = useState<any>(null);
  const [world,setWorld] = useState<any>(null);
  const [worldYear,setWorldYear] = useState<number|null>(null);
  const [russia,setRussia] = useState<any>(null);
  const [rivers,setRivers] = useState<any>(null);
  const worldCache = useRef(new Map<string,any>());
  const russiaCache = useRef(new Map<string,any>());
  const worldFile = useRef<string|null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`,{signal:controller.signal}).then((response) => response.json()),
      fetch(`${base}/data/territory/archive/manifest.json`,{signal:controller.signal}).then((response) => response.json()),
      fetch(`${base}/data/territory/hydro/rivers_50m.geojson`,{signal:controller.signal,cache:'force-cache'})
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null),
    ]).then(([nextIndex,nextManifest,nextRivers]) => {
      if (controller.signal.aborted) return;
      setIndex(nextIndex);
      setManifest(nextManifest);
      setRivers(nextRivers);
    }).catch(() => {});
    return () => controller.abort();
  },[]);

  useEffect(() => {
    const snapshot = snapshotAt(index,year);
    if (!snapshot || worldFile.current === snapshot.file) return;
    worldFile.current = snapshot.file;
    const cached = worldCache.current.get(snapshot.file);
    if (cached) {
      setWorld(cached);
      setWorldYear(snapshot.year);
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`,{signal:controller.signal,cache:'force-cache'})
      .then((response) => response.json())
      .then(normalizeCollection)
      .then((data) => {
        worldCache.current.set(snapshot.file,data);
        if (!controller.signal.aborted) {
          setWorld(data);
          setWorldYear(snapshot.year);
        }
      })
      .catch(() => { if (worldFile.current === snapshot.file) worldFile.current = null; });
    return () => controller.abort();
  },[index,year]);

  useEffect(() => {
    const entry = manifest?.polities?.find((item:any) => item.polity_id === polityId && item.file && item.features > 0);
    if (!entry?.file) {
      setRussia(null);
      return;
    }
    const cached = russiaCache.current.get(entry.file);
    if (cached) {
      setRussia(cached);
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`,{signal:controller.signal,cache:'force-cache'})
      .then((response) => response.json())
      .then(normalizeCollection)
      .then((data) => {
        russiaCache.current.set(entry.file,data);
        if (!controller.signal.aborted) setRussia(data);
      })
      .catch(() => {});
    return () => controller.abort();
  },[manifest,polityId]);

  return {index,world,worldYear,russia,rivers};
}

function baseStyle():any {
  return {
    version:8,
    glyphs:GLYPHS,
    sources:{
      terrain:{
        type:'raster-dem',
        tiles:[TERRAIN_TILES],
        tileSize:256,
        minzoom:0,
        maxzoom:15,
        encoding:'terrarium',
      },
      world:{type:'geojson',data:EMPTY_COLLECTION},
      russia:{type:'geojson',data:EMPTY_COLLECTION},
      rivers:{type:'geojson',data:EMPTY_COLLECTION},
      countryLabels:{type:'geojson',data:EMPTY_COLLECTION},
      capitals:{type:'geojson',data:EMPTY_COLLECTION},
      cities:{type:'geojson',data:EMPTY_COLLECTION},
    },
    layers:[
      {
        id:'ocean',type:'background',
        paint:{'background-color':'#77868b'},
      },
      {
        id:'world-fill',type:'fill',source:'world',
        paint:{'fill-color':'#b9bbb1','fill-opacity':0.94},
      },
      {
        id:'terrain-shade',type:'hillshade',source:'terrain',
        paint:{
          'hillshade-exaggeration':0.48,
          'hillshade-shadow-color':'#565e5b',
          'hillshade-highlight-color':'#fbf7e9',
          'hillshade-accent-color':'#777c76',
          'hillshade-illumination-direction':320,
          'hillshade-illumination-anchor':'viewport',
        },
      },
      {
        id:'land-wash',type:'fill',source:'world',
        paint:{'fill-color':'#ddd9c9','fill-opacity':0.14},
      },
      {
        id:'russia-fill',type:'fill',source:'russia',
        paint:{'fill-color':'#a4ad8f','fill-opacity':0.28},
      },
      {
        id:'world-border',type:'line',source:'world',
        paint:{
          'line-color':'#f0ece0',
          'line-opacity':0.82,
          'line-width':['interpolate',['linear'],['zoom'],1,0.75,3,1.25,6,1.8,10,2.3],
        },
      },
      {
        id:'russia-border',type:'line',source:'russia',
        paint:{
          'line-color':'#e5c66f',
          'line-opacity':0.98,
          'line-width':['interpolate',['linear'],['zoom'],1,1.6,3,2.25,6,3.1,10,4.1],
        },
      },
      {
        id:'rivers',type:'line',source:'rivers',
        layout:{'line-cap':'round','line-join':'round'},
        paint:{
          'line-color':['match',['get','__tier'],0,'#568ca5',1,'#6697ab','#7aa5b5'],
          'line-opacity':['match',['get','__tier'],0,0.98,1,0.86,0.68],
          'line-width':[
            'interpolate',['linear'],['zoom'],
            1,['match',['get','__tier'],0,0.9,1,0.55,0.3],
            5,['match',['get','__tier'],0,1.8,1,1.05,0.6],
            9,['match',['get','__tier'],0,3.4,1,2.0,1.1],
          ],
        },
      },
      {
        id:'country-labels',type:'symbol',source:'countryLabels',minzoom:1.25,
        layout:{
          'text-field':['get','name'],
          'text-font':['Open Sans Regular'],
          'text-size':['interpolate',['linear'],['zoom'],1.25,['get','size'],5,['*',['get','size'],1.08]],
          'text-letter-spacing':0.03,
          'text-max-width':9,
          'text-allow-overlap':false,
          'text-ignore-placement':false,
          'symbol-sort-key':['get','priority'],
        },
        paint:{
          'text-color':'#f7f2e6',
          'text-halo-color':'rgba(38,48,49,0.88)',
          'text-halo-width':1.4,
          'text-halo-blur':0.5,
        },
      },
      {
        id:'capital-labels',type:'symbol',source:'capitals',minzoom:4.9,
        layout:{
          'text-field':['concat','★ ',['get','name']],
          'text-font':['Open Sans Regular'],
          'text-size':['interpolate',['linear'],['zoom'],4.9,12,8,15,11,17],
          'text-offset':[0.6,0],
          'text-anchor':'left',
          'text-allow-overlap':false,
          'text-ignore-placement':false,
        },
        paint:{
          'text-color':'#f1d991',
          'text-halo-color':'rgba(24,31,32,0.94)',
          'text-halo-width':1.6,
        },
      },
      {
        id:'city-labels',type:'symbol',source:'cities',minzoom:6.8,
        layout:{
          'text-field':['concat','• ',['get','name']],
          'text-font':['Open Sans Regular'],
          'text-size':['interpolate',['linear'],['zoom'],6.8,11.5,10,14,12,16],
          'text-offset':[0.55,0],
          'text-anchor':'left',
          'text-allow-overlap':false,
          'text-ignore-placement':false,
        },
        paint:{
          'text-color':'#f4f0e7',
          'text-halo-color':'rgba(24,31,32,0.94)',
          'text-halo-width':1.45,
        },
      },
    ],
  };
}

export function HistoricalTerritoryMapLibreV13({initialYear=TERRITORY_MAX_YEAR}:{initialYear?:number}) {
  const sceneRef = useRef<HTMLElement|null>(null);
  const hostRef = useRef<HTMLDivElement|null>(null);
  const mapRef = useRef<MapLibreMap|null>(null);
  const timelineRef = useRef<HTMLDivElement|null>(null);
  const scrollFrame = useRef<number|null>(null);
  const [ready,setReady] = useState(false);
  const [mobile,setMobile] = useState(false);
  const [fullscreen,setFullscreen] = useState(false);
  const [year,setYear] = useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
  const [mode,setMode] = useState<ViewMode>('relief');
  const [projection,setProjectionMode] = useState<ProjectionMode>('globe');

  const period = territoryPeriodAt(year);
  const {index,world,worldYear,russia,rivers} = useHistoricalData(year,period.polityId);
  const russiaFeatures = useMemo(() => selectRussia(russia,year),[russia,year]);
  const activePlaces = useMemo(
    () => TERRITORY_PLACES.filter((place) =>
      (place.from ?? TERRITORY_MIN_YEAR) <= year && (place.to ?? TERRITORY_MAX_YEAR) >= year
    ),
    [year],
  );
  const snapshots = useMemo(() => {
    const years = new Set<number>(POLITY_TRANSITION_YEARS);
    for (const snapshot of index?.snapshots ?? []) years.add(snapshot.year);
    years.add(TERRITORY_MAX_YEAR);
    return [...years]
      .filter((value) => value >= TERRITORY_MIN_YEAR && value <= TERRITORY_MAX_YEAR)
      .sort((a,b) => a-b);
  },[index]);
  const ticks = useMemo(() => {
    const values:number[] = [];
    for (let value=Math.ceil(TERRITORY_MIN_YEAR/10)*10;value<=TERRITORY_MAX_YEAR;value+=10) values.push(value);
    return values;
  },[]);

  useEffect(() => {
    const query = matchMedia('(max-width:720px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change',update);
    return () => query.removeEventListener('change',update);
  },[]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let alive = true;
    const initial = territoryPeriodAt(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
    const map = new MapLibreMap({
      container:host,
      style:baseStyle(),
      center:initial.focus,
      zoom:window.innerWidth <= 720 ? 1.9 : 2.2,
      minZoom:1.05,
      maxZoom:12.5,
      pitch:0,
      bearing:0,
      attributionControl:false,
      renderWorldCopies:false,
      canvasContextAttributes:{antialias:true},
    });
    mapRef.current = map;
    map.scrollZoom.setWheelZoomRate(1/430);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('load',() => {
      if (!alive) return;
      map.setProjection({type:'globe'});
      map.setTerrain({source:'terrain',exaggeration:1.18});
      setReady(true);
    });

    const onFullscreen = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => map.resize());
    };
    document.addEventListener('fullscreenchange',onFullscreen);

    return () => {
      alive = false;
      document.removeEventListener('fullscreenchange',onFullscreen);
      map.remove();
      mapRef.current = null;
    };
  },[initialYear]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('world') as any)?.setData(worldForMap(world));
    (map.getSource('countryLabels') as any)?.setData(countryLabels(world));
  },[world,ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('russia') as any)?.setData(russiaForMap(russiaFeatures));
  },[russiaFeatures,ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('rivers') as any)?.setData(riversForMap(rivers));
  },[rivers,ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('capitals') as any)?.setData(placesForMap(activePlaces,'capital'));
    (map.getSource('cities') as any)?.setData(placesForMap(activePlaces,'regional'));
  },[activePlaces,ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (mode === 'states') {
      map.setPaintProperty('world-fill','fill-color',['coalesce',['get','__color'],'#9b8f7c']);
      map.setPaintProperty('world-fill','fill-opacity',0.82);
      map.setPaintProperty('land-wash','fill-opacity',0.07);
      map.setPaintProperty('world-border','line-opacity',0.96);
      map.setPaintProperty('russia-fill','fill-opacity',0.42);
    } else {
      map.setPaintProperty('world-fill','fill-color','#b9bbb1');
      map.setPaintProperty('world-fill','fill-opacity',0.94);
      map.setPaintProperty('land-wash','fill-opacity',0.14);
      map.setPaintProperty('world-border','line-opacity',0.82);
      map.setPaintProperty('russia-fill','fill-opacity',0.28);
    }
  },[mode,ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (projection === 'globe') {
      map.setProjection({type:'globe'});
      map.setTerrain({source:'terrain',exaggeration:1.18});
      map.easeTo({pitch:0,duration:320});
    } else {
      map.setTerrain(null);
      map.setProjection({type:'mercator'});
      map.easeTo({pitch:0,bearing:0,duration:320});
    }
  },[projection,ready]);

  const focusRussia = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center:period.focus,
      zoom:mobile ? 1.9 : 2.2,
      pitch:0,
      bearing:0,
      duration:550,
    });
  },[period.focus,mobile]);

  const zoom = useCallback((delta:number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({zoom:clamp(map.getZoom()+delta,1.05,12.5),duration:220});
  },[]);

  const toggleFullscreen = useCallback(async () => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await scene.requestFullscreen();
  },[]);

  const scrollToYear = useCallback((next:number,behavior:ScrollBehavior='smooth') => {
    const element = timelineRef.current;
    if (!element) return;
    const target = clamp(Math.round(next),TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR);
    element.scrollTo({left:(target-TERRITORY_MIN_YEAR)*YEAR_PX,behavior});
    setYear(target);
  },[]);

  useEffect(() => {
    requestAnimationFrame(() => scrollToYear(initialYear,'auto'));
  },[initialYear,scrollToYear]);

  function onTimelineScroll() {
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const element = timelineRef.current;
      if (!element) return;
      const next = clamp(
        Math.round(TERRITORY_MIN_YEAR + element.scrollLeft / YEAR_PX),
        TERRITORY_MIN_YEAR,
        TERRITORY_MAX_YEAR,
      );
      setYear((previous) => previous === next ? previous : next);
    });
  }

  function onTimelineWheel(event:React.WheelEvent<HTMLElement>) {
    const element = timelineRef.current;
    if (!element) return;
    const raw = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!raw) return;
    event.preventDefault();
    element.scrollLeft += raw * 0.72;
  }

  function jump(direction:number) {
    const candidates = direction > 0
      ? snapshots.filter((value) => value > year)
      : snapshots.filter((value) => value < year).reverse();
    if (candidates.length) scrollToYear(candidates[0]);
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
              <button className={mode === 'relief' ? styles.active : ''} onClick={() => setMode('relief')}>Рельеф</button>
              <button className={mode === 'states' ? styles.active : ''} onClick={() => setMode('states')}>Государства</button>
            </div>
            <button className={styles.projectionToggle} onClick={() => setProjectionMode((value) => value === 'globe' ? 'map' : 'globe')}>
              {projection === 'globe' ? 'Карта' : 'Глобус'}
            </button>
            <button onClick={toggleFullscreen}>{fullscreen ? 'Свернуть' : 'На весь экран'}</button>
          </div>
        </header>

        <aside className={styles.story}>
          <small>{period.era}</small>
          <div><h1>{period.label}</h1><b>{year}</b></div>
          <p>Исторический мировой срез {worldYear ?? '—'} года · рельеф, постоянные границы, гидрография и масштабные подписи</p>
        </aside>

        <div className={styles.zoomTools}>
          <button onClick={() => zoom(0.85)}>+</button>
          <button onClick={() => zoom(-0.85)}>−</button>
          <button onClick={focusRussia}>◎</button>
        </div>

        <section className={styles.timeline} onWheel={onTimelineWheel}>
          <div className={styles.timelineHead}>
            <button onClick={() => jump(-1)}>‹</button>
            <div><strong>{period.shortLabel}</strong><span>Наведи курсор и крути колесо мыши</span></div>
            <b>{year}</b>
            <button onClick={() => jump(1)}>›</button>
          </div>
          <div className={styles.rulerWrap}>
            <div className={styles.centerNeedle}/>
            <div ref={timelineRef} className={styles.rulerViewport} onScroll={onTimelineScroll}>
              <div className={styles.ruler} style={{width:`calc(100vw + ${(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>
                {ticks.map((value) => (
                  <i key={value} className={`${styles.tick} ${value%50===0 ? styles.majorTick : ''}`} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}>
                    {value%50===0 ? <span>{value}</span> : null}
                  </i>
                ))}
                {POLITY_TRANSITION_YEARS.map((value) => (
                  <i key={`e-${value}`} className={styles.eventTick} style={{left:`calc(50vw + ${(value-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}/>
                ))}
              </div>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
