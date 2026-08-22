'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geoArea,
  geoCentroid,
  geoDistance,
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoProjection
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import {
  POLITY_TRANSITION_YEARS,
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt
} from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-globe.module.css';

type ViewMode = 'globe' | 'map';
type Rotation = [number, number, number];
type AnyFeature = Feature<Geometry, Record<string, unknown>>;
type AnyCollection = FeatureCollection<Geometry, Record<string, unknown>>;
type Point = { x: number; y: number };

type RussiaManifest = {
  polities?: Array<{ polity_id: string; file: string | null; features: number }>;
};

type WorldIndex = {
  snapshots: Array<{ year: number; file: string }>;
};

const sphere = { type: 'Sphere' } as const;
const graticule = geoGraticule10();
const TWO_PI = Math.PI * 2;
const PALETTE = ['#56604f', '#60564b', '#4a5d5b', '#654d4a', '#4d614e', '#57505f', '#656044', '#465650', '#635842'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function yearPart(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).match(/-?\d{3,4}/);
  return match ? Number(match[0]) : null;
}

function validAt(feature: AnyFeature, year: number) {
  const start = yearPart(feature.properties?.start_date);
  const end = yearPart(feature.properties?.end_date);
  return (start === null || year >= start) && (end === null || year <= end);
}

function reverseRing(ring: Position[]) {
  return [...ring].reverse();
}

function normalizeFeature(feature: AnyFeature): AnyFeature {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return feature;
  if (geoArea(feature as never) <= TWO_PI) return feature;
  if (feature.geometry.type === 'Polygon') {
    const geometry: Polygon = { type: 'Polygon', coordinates: feature.geometry.coordinates.map(reverseRing) };
    return { ...feature, geometry };
  }
  const geometry: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: feature.geometry.coordinates.map((polygon) => polygon.map(reverseRing))
  };
  return { ...feature, geometry };
}

function normalizeCollection(collection: AnyCollection): AnyCollection {
  return { ...collection, features: collection.features.map(normalizeFeature) };
}

function featureName(feature: AnyFeature) {
  const p = feature.properties ?? {};
  const candidates = [p.ABBREVN, p.NAME, p.SUBJECTO, p.PARTOF, p.name, p.ADMIN, p.entity, p.polity];
  const value = candidates.find((v) => typeof v === 'string' && v.trim());
  return typeof value === 'string' ? value.trim() : '';
}

function featureColor(feature: AnyFeature, index: number) {
  const name = featureName(feature);
  let hash = 17 + index;
  for (let i = 0; i < name.length; i += 1) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function selectRussia(collection: AnyCollection | null, year: number) {
  if (!collection?.features.length) return [] as AnyFeature[];
  const exact = collection.features.filter((f) => validAt(f, year));
  if (exact.length) return exact;
  const previous = collection.features
    .map((feature) => ({ feature, start: yearPart(feature.properties?.start_date) }))
    .filter((x): x is { feature: AnyFeature; start: number } => x.start !== null && x.start <= year)
    .sort((a, b) => b.start - a.start);
  if (!previous.length) return [];
  const start = previous[0].start;
  return previous.filter((x) => x.start === start).map((x) => x.feature);
}

function useHistoricalData(year: number, polityId: string) {
  const [index, setIndex] = useState<WorldIndex | null>(null);
  const [manifest, setManifest] = useState<RussiaManifest | null>(null);
  const [world, setWorld] = useState<AnyCollection | null>(null);
  const [worldYear, setWorldYear] = useState<number | null>(null);
  const [russia, setRussia] = useState<AnyCollection | null>(null);
  const worldCache = useRef(new Map<string, AnyCollection>());
  const russiaCache = useRef(new Map<string, AnyCollection>());

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`, { signal: controller.signal }).then((r) => r.json() as Promise<WorldIndex>),
      fetch(`${base}/data/territory/archive/manifest.json`, { signal: controller.signal }).then((r) => r.json() as Promise<RussiaManifest>)
    ]).then(([a, b]) => {
      if (!controller.signal.aborted) { setIndex(a); setManifest(b); }
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!index?.snapshots.length) return;
    const snapshots = [...index.snapshots].sort((a, b) => a.year - b.year);
    const snapshot = [...snapshots].reverse().find((s) => s.year <= year) ?? snapshots[0];
    const cached = worldCache.current.get(snapshot.file);
    if (cached) { setWorld(cached); setWorldYear(snapshot.year); return; }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`, { signal: controller.signal, cache: 'force-cache' })
      .then((r) => r.json() as Promise<AnyCollection>)
      .then((data) => normalizeCollection(data))
      .then((data) => {
        worldCache.current.set(snapshot.file, data);
        if (!controller.signal.aborted) { setWorld(data); setWorldYear(snapshot.year); }
      }).catch(() => undefined);
    return () => controller.abort();
  }, [index, year]);

  useEffect(() => {
    const entry = manifest?.polities?.find((p) => p.polity_id === polityId && p.file && p.features > 0);
    if (!entry?.file) { setRussia(null); return; }
    const cached = russiaCache.current.get(entry.file);
    if (cached) { setRussia(cached); return; }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const controller = new AbortController();
    fetch(`${base}/data/territory/archive/${entry.file}`, { signal: controller.signal, cache: 'force-cache' })
      .then((r) => r.json() as Promise<AnyCollection>)
      .then((data) => normalizeCollection(data))
      .then((data) => {
        russiaCache.current.set(entry.file!, data);
        if (!controller.signal.aborted) setRussia(data);
      }).catch(() => undefined);
    return () => controller.abort();
  }, [manifest, polityId]);

  return { index, world, worldYear, russia };
}

export function HistoricalTerritoryGlobePremium({ initialYear = TERRITORY_MAX_YEAR }: { initialYear?: number }) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const inertia = useRef<number | null>(null);
  const drag = useRef({ active: false, x: 0, y: 0, rotation: [-64, -48, 0] as Rotation, vx: 0, vy: 0, time: 0 });

  const [viewport, setViewport] = useState({ width: 1600, height: 900 });
  const [year, setYear] = useState(clamp(initialYear, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  const [viewMode, setViewMode] = useState<ViewMode>('globe');
  const [rotation, setRotation] = useState<Rotation>([-64, -48, 0]);
  const [zoom, setZoom] = useState(1.42);
  const [fullscreen, setFullscreen] = useState(false);
  const [showBorders, setShowBorders] = useState(true);

  const period = territoryPeriodAt(year);
  const { index, world, worldYear, russia } = useHistoricalData(year, period.polityId);
  const portrait = viewport.height > viewport.width * 1.08;
  const russiaFeatures = useMemo(() => selectRussia(russia, year), [russia, year]);
  const russiaCollection = useMemo<AnyCollection>(() => ({ type: 'FeatureCollection', features: russiaFeatures }), [russiaFeatures]);

  useEffect(() => {
    const node = sceneRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setViewport({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const projection = useMemo<GeoProjection>(() => {
    const { width, height } = viewport;
    if (viewMode === 'map') {
      return geoNaturalEarth1().translate([width / 2, height * (portrait ? .45 : .5)]).scale(Math.min(width / 5.6, height / 3.15) * zoom).precision(.35);
    }
    const radius = portrait ? Math.min(width * .48, height * .34) : Math.min(width * .33, height * .45);
    return geoOrthographic()
      .translate([width * (portrait ? .5 : .62), height * (portrait ? .44 : .5)])
      .scale(radius * zoom)
      .rotate(rotation)
      .clipAngle(90)
      .precision(.35);
  }, [portrait, rotation, viewMode, viewport, zoom]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const spherePath = path(sphere as never) ?? '';
  const graticulePath = path(graticule as never) ?? '';
  const russiaPath = russiaFeatures.length ? path(russiaCollection as never) : null;
  const center: [number, number] = [-rotation[0], -rotation[1]];

  const countryLabels = useMemo(() => {
    if (!world) return [] as Array<{ name: string; x: number; y: number; size: number }>;
    return world.features.flatMap((feature) => {
      const name = featureName(feature);
      if (!name) return [];
      const bounds = path.bounds(feature as never);
      const w = Math.abs(bounds[1][0] - bounds[0][0]);
      const h = Math.abs(bounds[1][1] - bounds[0][1]);
      const area = w * h;
      if (!Number.isFinite(area) || area < (portrait ? 170 : 300)) return [];
      const c = geoCentroid(feature as never);
      if (viewMode === 'globe' && geoDistance(c, center) > Math.PI / 2 - .03) return [];
      const p = projection(c);
      if (!p) return [];
      return [{ name, x: p[0], y: p[1], size: clamp(Math.sqrt(area) / 7.5, portrait ? 11 : 12, portrait ? 18 : 21) }];
    });
  }, [center, path, portrait, projection, viewMode, world]);

  const places = useMemo(() => {
    return TERRITORY_PLACES.flatMap((place) => {
      if ((place.from ?? TERRITORY_MIN_YEAR) > year || (place.to ?? TERRITORY_MAX_YEAR) < year) return [];
      if (place.kind === 'regional' && zoom < 1.22) return [];
      if (viewMode === 'globe' && geoDistance([place.lon, place.lat], center) > Math.PI / 2 - .04) return [];
      const p = projection([place.lon, place.lat]);
      if (!p) return [];
      return [{ ...place, x: p[0], y: p[1] }];
    });
  }, [center, projection, viewMode, year, zoom]);

  const russiaLabel = useMemo(() => {
    if (!russiaFeatures.length) return null;
    const c = geoCentroid(russiaCollection as never);
    if (viewMode === 'globe' && geoDistance(c, center) > Math.PI / 2 - .03) return null;
    const p = projection(c);
    return p ? { x: p[0], y: p[1] } : null;
  }, [center, projection, russiaCollection, russiaFeatures.length, viewMode]);

  const stopInertia = useCallback(() => {
    if (inertia.current !== null) cancelAnimationFrame(inertia.current);
    inertia.current = null;
  }, []);

  const focusRussia = useCallback(() => {
    stopInertia();
    const [lon, lat] = period.focus;
    setRotation([-lon, -lat, 0]);
    setZoom(viewMode === 'globe' ? 1.42 : 1.1);
  }, [period.focus, stopInertia, viewMode]);

  useEffect(() => { focusRussia(); }, [period.polityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopInertia(), [stopInertia]);
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const zoomBounds = viewMode === 'globe' ? [.9, 3.4] as const : [.72, 2.6] as const;

  function pointerDown(e: React.PointerEvent<SVGSVGElement>) {
    stopInertia();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const values = [...pointers.current.values()];
    if (values.length >= 2) {
      pinch.current = { distance: distance(values[0], values[1]), zoom };
      drag.current.active = false;
      return;
    }
    if (viewMode !== 'globe') return;
    drag.current = { active: true, x: e.clientX, y: e.clientY, rotation, vx: 0, vy: 0, time: performance.now() };
  }

  function pointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const values = [...pointers.current.values()];
    if (values.length >= 2) {
      const d = distance(values[0], values[1]);
      if (!pinch.current) pinch.current = { distance: d, zoom };
      setZoom(clamp(pinch.current.zoom * d / Math.max(24, pinch.current.distance), zoomBounds[0], zoomBounds[1]));
      return;
    }
    if (!drag.current.active || viewMode !== 'globe') return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    const sensitivity = .2 / zoom;
    const next: Rotation = [drag.current.rotation[0] + dx * sensitivity, clamp(drag.current.rotation[1] - dy * sensitivity, -78, 78), 0];
    const dt = Math.max(8, performance.now() - drag.current.time);
    drag.current.vx = (dx * sensitivity) / dt;
    drag.current.vy = (-dy * sensitivity) / dt;
    setRotation(next);
  }

  function pointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const hadTwo = pointers.current.size >= 2;
    pointers.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!drag.current.active || viewMode !== 'globe' || hadTwo) { drag.current.active = false; return; }
    drag.current.active = false;
    let vx = drag.current.vx * 16;
    let vy = drag.current.vy * 16;
    const animate = () => {
      vx *= .93; vy *= .93;
      if (Math.abs(vx) + Math.abs(vy) < .015) { inertia.current = null; return; }
      setRotation((r) => [r[0] + vx, clamp(r[1] + vy, -78, 78), 0]);
      inertia.current = requestAnimationFrame(animate);
    };
    inertia.current = requestAnimationFrame(animate);
  }

  function changeZoom(delta: number) {
    setZoom((z) => clamp(z + delta, zoomBounds[0], zoomBounds[1]));
  }

  function setYearSafe(next: number) {
    setYear(clamp(Math.round(next), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  }

  const snapshots = useMemo(() => {
    const years = new Set(POLITY_TRANSITION_YEARS);
    for (const s of index?.snapshots ?? []) years.add(s.year);
    years.add(TERRITORY_MAX_YEAR);
    return [...years].filter((y) => y >= TERRITORY_MIN_YEAR && y <= TERRITORY_MAX_YEAR).sort((a, b) => a - b);
  }, [index]);

  function jumpSnapshot(direction: -1 | 1) {
    const candidates = direction > 0 ? snapshots.filter((y) => y > year) : snapshots.filter((y) => y < year).reverse();
    if (candidates.length) setYearSafe(candidates[0]);
  }

  async function toggleFullscreen() {
    if (!sceneRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await sceneRef.current.requestFullscreen();
  }

  return (
    <main className={`${styles.page} premiumTerritoryPage`}>
      <section ref={sceneRef} className={`${styles.scene} premiumTerritoryScene`}>
        <div className={styles.space} aria-hidden="true" />
        <svg
          className={`${styles.globe} ${viewMode === 'globe' ? styles.globeInteractive : styles.mapInteractive}`}
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          role="img"
          aria-label={`Исторические границы мира: ${year} год`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onWheel={(e) => { e.preventDefault(); changeZoom(e.deltaY > 0 ? -.11 : .11); }}
        >
          <defs>
            <clipPath id="premiumSphereClip"><path d={spherePath} /></clipPath>
            <linearGradient id="premiumOcean" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#102c38" />
              <stop offset="48%" stopColor="#071b24" />
              <stop offset="100%" stopColor="#021017" />
            </linearGradient>
            <pattern id="premiumGrain" width="18" height="18" patternUnits="userSpaceOnUse">
              <path d="M0 4L18 1M0 13L18 10" stroke="rgba(244,224,178,.04)" strokeWidth=".55" />
              <circle cx="5" cy="7" r=".45" fill="rgba(250,229,181,.06)" />
              <circle cx="14" cy="15" r=".4" fill="rgba(0,0,0,.15)" />
            </pattern>
          </defs>
          <path d={spherePath} fill={viewMode === 'globe' ? 'url(#premiumOcean)' : '#07171e'} className={viewMode === 'globe' ? styles.ocean : styles.mapOcean} />
          <path d={graticulePath} className={styles.graticule} />
          <g clipPath={viewMode === 'globe' ? 'url(#premiumSphereClip)' : undefined}>
            {(world?.features ?? []).map((feature, index) => {
              const d = path(feature as never);
              if (!d) return null;
              return <path key={index} d={d} style={{ fill: featureColor(feature, index), stroke: showBorders ? 'rgba(224,211,180,.45)' : 'none', strokeWidth: .58, vectorEffect: 'non-scaling-stroke' }} />;
            })}
            {russiaPath && <path d={russiaPath} style={{ fill: '#2f4f33', stroke: 'none' }} />}
            {russiaPath && <path d={russiaPath} style={{ fill: 'none', stroke: '#d8b96b', strokeWidth: .78, vectorEffect: 'non-scaling-stroke' }} />}
            <path d={spherePath} fill="url(#premiumGrain)" opacity=".72" pointerEvents="none" />
          </g>

          <g className="premiumCountryLabels" pointerEvents="none">
            {countryLabels.map((label, index) => (
              <text key={`${label.name}-${index}`} x={label.x} y={label.y} textAnchor="middle" className="premiumCountryLabel" style={{ fontSize: label.size }}>{label.name}</text>
            ))}
          </g>
          {russiaLabel && <text x={russiaLabel.x} y={russiaLabel.y} textAnchor="middle" className="premiumRussiaLabel">{period.label}</text>}
          <g className="premiumPlaceLabels" pointerEvents="none">
            {places.map((place) => (
              <g key={`${place.name}-${place.lon}-${place.lat}`} transform={`translate(${place.x} ${place.y})`}>
                {place.kind === 'capital'
                  ? <path d="M0-6 1.75-1.9 6-1.9 2.55.8 3.9 5.1 0 2.65-3.9 5.1-2.55.8-6-1.9-1.75-1.9Z" className="premiumCapitalStar" />
                  : <circle r="2.5" className="premiumCityDot" />}
                <text x={place.kind === 'capital' ? 9 : 7} y="4" className={place.kind === 'capital' ? 'premiumCapitalLabel' : 'premiumCityLabel'}>{place.name}</text>
              </g>
            ))}
          </g>
          {viewMode === 'globe' && <path d={spherePath} className={styles.rim} style={{ stroke: 'rgba(226,207,156,.58)', strokeWidth: .8 }} />}
        </svg>

        <header className={styles.topbar}>
          <div className={styles.brand}><span className={styles.brandSymbol}>Р</span><div><strong>Правители России</strong><span>Исторический глобус</span></div></div>
          <div className={styles.topControls}>
            <div className={styles.segmented}>
              <button className={viewMode === 'globe' ? styles.active : ''} onClick={() => setViewMode('globe')}>Глобус</button>
              <button className={viewMode === 'map' ? styles.active : ''} onClick={() => setViewMode('map')}>Карта</button>
            </div>
            <button className={styles.controlButton} onClick={focusRussia}>К России</button>
            <button className={styles.controlButton} onClick={toggleFullscreen}>{fullscreen ? 'Свернуть' : 'На весь экран'}</button>
          </div>
        </header>

        <aside className={styles.story}>
          <div className={styles.eyebrow}>{period.era}</div>
          <div className={styles.storyRow}><h1>{period.label}</h1><span className={styles.storyYear}>{year}</span></div>
          <p>Исторический мировой срез {worldYear ?? '—'} года · локальная проектная база границ, подписей и городов.</p>
        </aside>

        <div className={styles.mapTools}>
          <button onClick={() => changeZoom(.16)} aria-label="Приблизить">+</button>
          <button onClick={() => changeZoom(-.16)} aria-label="Отдалить">−</button>
          <button onClick={() => setShowBorders((v) => !v)} className={showBorders ? styles.toolActive : ''} aria-label="Границы государств">◎</button>
        </div>

        <div className="premiumLegend" aria-hidden="true"><span>★ столица государства</span><span>• крупный / региональный центр</span></div>

        <section className={styles.timeline} aria-label="Хронология территории России">
          <div className={styles.timelineTop}>
            <button onClick={() => jumpSnapshot(-1)} aria-label="Предыдущее изменение">‹</button>
            <div><strong>{period.shortLabel}</strong><span>{TERRITORY_MIN_YEAR} — {TERRITORY_MAX_YEAR}</span></div>
            <div className={styles.timelineCurrent}>{year}</div>
            <button onClick={() => jumpSnapshot(1)} aria-label="Следующее изменение">›</button>
          </div>
          <div className={styles.rangeRow}>
            <span>{TERRITORY_MIN_YEAR}</span>
            <div className={styles.rangeTrack}>
              <input type="range" min={TERRITORY_MIN_YEAR} max={TERRITORY_MAX_YEAR} step={1} value={year} onChange={(e) => setYearSafe(Number(e.target.value))} aria-label="Год исторической карты" />
              <div className={styles.marks} aria-hidden="true">
                {snapshots.map((value) => <i key={value} style={{ left: `${((value - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100}%` }} />)}
              </div>
            </div>
            <span>{TERRITORY_MAX_YEAR}</span>
          </div>
        </section>
      </section>
    </main>
  );
}
