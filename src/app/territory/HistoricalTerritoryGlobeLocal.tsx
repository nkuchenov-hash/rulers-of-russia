'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geoArea,
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoProjection
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon, Position } from 'geojson';
import {
  POLITY_TRANSITION_YEARS,
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt
} from './territoryChronology';
import styles from './territory-globe.module.css';

type ViewMode = 'globe' | 'map';
type Rotation = [number, number, number];
type AnyFeature = Feature<Geometry, Record<string, unknown>>;
type AnyCollection = FeatureCollection<Geometry, Record<string, unknown>>;
type Point = { x: number; y: number };

type RussiaManifest = {
  dataset?: string;
  polities?: Array<{ polity_id: string; file: string | null; features: number }>;
};

type WorldIndex = {
  dataset?: string;
  min_year: number;
  max_year: number;
  snapshots: Array<{ year: number; file: string }>;
};

const sphere = { type: 'Sphere' } as const;
const graticule = geoGraticule10();
const TWO_PI = Math.PI * 2;

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

function selectRussiaFeatures(collection: AnyCollection | null, year: number) {
  if (!collection?.features.length) return [] as AnyFeature[];
  const exact = collection.features.filter((feature) => validAt(feature, year));
  if (exact.length) return exact;
  const previous = collection.features
    .map((feature) => ({ feature, start: yearPart(feature.properties?.start_date) }))
    .filter((item): item is { feature: AnyFeature; start: number } => item.start !== null && item.start <= year)
    .sort((a, b) => b.start - a.start);
  if (!previous.length) return [];
  const start = previous[0].start;
  return previous.filter((item) => item.start === start).map((item) => item.feature);
}

function reverseRing(ring: Position[]) {
  return [...ring].reverse();
}

function normalizePolygonWinding(feature: AnyFeature): AnyFeature {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return feature;

  // d3-geo interprets spherical ring winding. Some historical sources contain
  // opposite winding, which makes a polygon mean "everything except this state".
  // If a feature covers more than a hemisphere, reverse all rings once.
  if (geoArea(feature as never) <= TWO_PI) return feature;

  if (feature.geometry.type === 'Polygon') {
    const geometry: Polygon = {
      type: 'Polygon',
      coordinates: feature.geometry.coordinates.map(reverseRing)
    };
    return { ...feature, geometry };
  }

  const geometry: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: feature.geometry.coordinates.map((polygon) => polygon.map(reverseRing))
  };
  return { ...feature, geometry };
}

function normalizeCollection(collection: AnyCollection): AnyCollection {
  return { ...collection, features: collection.features.map(normalizePolygonWinding) };
}

function useHistoricalData(year: number, polityId: string) {
  const [worldIndex, setWorldIndex] = useState<WorldIndex | null>(null);
  const [world, setWorld] = useState<AnyCollection | null>(null);
  const [worldSnapshotYear, setWorldSnapshotYear] = useState<number | null>(null);
  const [russiaManifest, setRussiaManifest] = useState<RussiaManifest | null>(null);
  const [russia, setRussia] = useState<AnyCollection | null>(null);
  const worldCache = useRef(new Map<string, AnyCollection>());
  const russiaCache = useRef(new Map<string, AnyCollection>());

  useEffect(() => {
    const controller = new AbortController();
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    Promise.all([
      fetch(`${base}/data/territory/world-history/index.json`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error(`world index ${r.status}`);
        return r.json() as Promise<WorldIndex>;
      }),
      fetch(`${base}/data/territory/archive/manifest.json`, { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error(`russia manifest ${r.status}`);
        return r.json() as Promise<RussiaManifest>;
      })
    ]).then(([nextWorld, nextRussia]) => {
      if (controller.signal.aborted) return;
      setWorldIndex(nextWorld);
      setRussiaManifest(nextRussia);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!worldIndex?.snapshots.length) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const snapshots = [...worldIndex.snapshots].sort((a, b) => a.year - b.year);
    const snapshot = [...snapshots].reverse().find((item) => item.year <= year) ?? snapshots[0];
    const key = snapshot.file;
    const cached = worldCache.current.get(key);
    if (cached) {
      setWorld(cached);
      setWorldSnapshotYear(snapshot.year);
      return;
    }

    const controller = new AbortController();
    fetch(`${base}/data/territory/world-history/${snapshot.file}`, {
      signal: controller.signal,
      cache: 'force-cache'
    }).then(async (response) => {
      if (!response.ok) throw new Error(`world snapshot ${response.status}`);
      const collection = normalizeCollection(await response.json() as AnyCollection);
      worldCache.current.set(key, collection);
      if (!controller.signal.aborted) {
        setWorld(collection);
        setWorldSnapshotYear(snapshot.year);
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [worldIndex, year]);

  useEffect(() => {
    if (!russiaManifest) return;
    const entry = russiaManifest.polities?.find((item) => item.polity_id === polityId && item.file && item.features > 0);
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
    fetch(`${base}/data/territory/archive/${entry.file}`, { signal: controller.signal, cache: 'force-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`russia archive ${response.status}`);
        const collection = normalizeCollection(await response.json() as AnyCollection);
        russiaCache.current.set(entry.file!, collection);
        if (!controller.signal.aborted) setRussia(collection);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [polityId, russiaManifest]);

  return { world, worldSnapshotYear, russia, worldIndex, russiaManifest };
}

export function HistoricalTerritoryGlobeLocal({ initialYear = TERRITORY_MAX_YEAR }: { initialYear?: number }) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const inertiaRef = useRef<number | null>(null);
  const dragRef = useRef({ active: false, x: 0, y: 0, rotation: [-64, -48, 0] as Rotation, vx: 0, vy: 0, time: 0 });

  const [viewport, setViewport] = useState({ width: 1600, height: 900 });
  const [year, setYear] = useState(clamp(initialYear, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  const [viewMode, setViewMode] = useState<ViewMode>('globe');
  const [rotation, setRotation] = useState<Rotation>([-64, -48, 0]);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [showReferenceBorders, setShowReferenceBorders] = useState(true);

  const period = territoryPeriodAt(year);
  const { world, worldSnapshotYear, russia, worldIndex } = useHistoricalData(year, period.polityId);
  const portrait = viewport.height > viewport.width * 1.08;
  const russiaFeatures = useMemo(() => selectRussiaFeatures(russia, year), [russia, year]);
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
      return geoNaturalEarth1()
        .translate([width / 2, height * (portrait ? .44 : .49)])
        .scale(Math.min(width / 5.85, height / 3.35) * zoom)
        .precision(.35);
    }
    const radius = portrait ? Math.min(width * .455, height * .315) : Math.min(width * .305, height * .425);
    return geoOrthographic()
      .translate([width * (portrait ? .5 : .62), height * (portrait ? .435 : .49)])
      .scale(radius * zoom)
      .rotate(rotation)
      .clipAngle(90)
      .precision(.35);
  }, [portrait, rotation, viewMode, viewport, zoom]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const spherePath = path(sphere as never) ?? '';
  const graticulePath = path(graticule as never) ?? '';
  const russiaPath = russiaFeatures.length ? path(russiaCollection as never) : null;
  const zoomBounds = viewMode === 'globe' ? [.72, 2.75] as const : [.68, 2.2] as const;

  const stopInertia = useCallback(() => {
    if (inertiaRef.current !== null) cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = null;
  }, []);

  const focusRussia = useCallback(() => {
    stopInertia();
    const [lon, lat] = period.focus;
    setRotation([-lon, -lat, 0]);
    setZoom(viewMode === 'globe' ? 1 : .96);
  }, [period.focus, stopInertia, viewMode]);

  useEffect(() => { focusRussia(); }, [period.polityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopInertia(), [stopInertia]);
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function pointerDown(event: React.PointerEvent<SVGSVGElement>) {
    stopInertia();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      pinchRef.current = { distance: distance(pointers[0], pointers[1]), zoom };
      dragRef.current.active = false;
      return;
    }
    if (viewMode !== 'globe') return;
    dragRef.current = { active: true, x: event.clientX, y: event.clientY, rotation, vx: 0, vy: 0, time: performance.now() };
  }

  function pointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = [...pointersRef.current.values()];
    if (pointers.length >= 2) {
      const current = distance(pointers[0], pointers[1]);
      if (!pinchRef.current) pinchRef.current = { distance: current, zoom };
      const ratio = current / Math.max(24, pinchRef.current.distance);
      setZoom(clamp(pinchRef.current.zoom * ratio, zoomBounds[0], zoomBounds[1]));
      return;
    }
    const drag = dragRef.current;
    if (!drag.active || viewMode !== 'globe') return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const sensitivity = .24 / zoom;
    const next: Rotation = [drag.rotation[0] + dx * sensitivity, clamp(drag.rotation[1] - dy * sensitivity, -78, 78), 0];
    const dt = Math.max(8, performance.now() - drag.time);
    drag.vx = (dx * sensitivity) / dt;
    drag.vy = (-dy * sensitivity) / dt;
    setRotation(next);
  }

  function pointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const hadTwo = pointersRef.current.size >= 2;
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    if (!drag.active || viewMode !== 'globe' || hadTwo) { drag.active = false; return; }
    drag.active = false;
    let vx = drag.vx * 16;
    let vy = drag.vy * 16;
    const animate = () => {
      vx *= .94; vy *= .94;
      if (Math.abs(vx) + Math.abs(vy) < .015) { inertiaRef.current = null; return; }
      setRotation((current) => [current[0] + vx, clamp(current[1] + vy, -78, 78), 0]);
      inertiaRef.current = requestAnimationFrame(animate);
    };
    inertiaRef.current = requestAnimationFrame(animate);
  }

  function changeZoom(delta: number) {
    setZoom((value) => clamp(value + delta, zoomBounds[0], zoomBounds[1]));
  }

  async function toggleFullscreen() {
    if (!sceneRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await sceneRef.current.requestFullscreen();
  }

  function setYearSafe(next: number) {
    setYear(clamp(Math.round(next), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  }

  const snapshotYears = useMemo(() => {
    const years = new Set(POLITY_TRANSITION_YEARS);
    for (const item of worldIndex?.snapshots ?? []) years.add(item.year);
    years.add(TERRITORY_MAX_YEAR);
    return [...years].filter((value) => value >= TERRITORY_MIN_YEAR && value <= TERRITORY_MAX_YEAR).sort((a, b) => a - b);
  }, [worldIndex]);

  function jumpSnapshot(direction: -1 | 1) {
    const candidates = direction > 0 ? snapshotYears.filter((value) => value > year) : snapshotYears.filter((value) => value < year).reverse();
    if (candidates.length) setYearSafe(candidates[0]);
  }

  return (
    <main className={styles.page}>
      <section ref={sceneRef} className={styles.scene}>
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
          onWheel={(event) => { event.preventDefault(); changeZoom(event.deltaY > 0 ? -.09 : .09); }}
        >
          <clipPath id="historicalSphereClip"><path d={spherePath} /></clipPath>
          <path d={spherePath} className={viewMode === 'globe' ? styles.ocean : styles.mapOcean} />
          <path d={graticulePath} className={styles.graticule} />
          <g clipPath={viewMode === 'globe' ? 'url(#historicalSphereClip)' : undefined}>
            {(world?.features ?? []).map((feature, index) => {
              const d = path(feature as never);
              if (!d) return null;
              return (
                <path
                  key={index}
                  d={d}
                  className={styles.country}
                  style={{ stroke: showReferenceBorders ? 'rgba(224,220,203,.28)' : 'none', strokeWidth: .46, vectorEffect: 'non-scaling-stroke' }}
                />
              );
            })}
            {russiaPath && <path d={russiaPath} className={styles.territoryFill} />}
            {russiaPath && <path d={russiaPath} className={styles.territoryBorder} />}
          </g>
          {viewMode === 'globe' && <path d={spherePath} className={styles.rim} />}
        </svg>

        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandSymbol}>Р</span>
            <div><strong>Правители России</strong><span>Исторический глобус</span></div>
          </div>
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
          <p>Мировые границы берутся из локального исторического архива. Для {year} года используется срез {worldSnapshotYear ?? '—'} года.</p>
          <div className={styles.source}>локальный архив · historical world boundaries</div>
        </aside>

        <div className={styles.mapTools}>
          <button onClick={() => changeZoom(.14)} aria-label="Приблизить">+</button>
          <button onClick={() => changeZoom(-.14)} aria-label="Отдалить">−</button>
          <button onClick={() => setShowReferenceBorders((value) => !value)} className={showReferenceBorders ? styles.toolActive : ''} aria-label="Границы государств">◎</button>
        </div>

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
              <input type="range" min={TERRITORY_MIN_YEAR} max={TERRITORY_MAX_YEAR} step={1} value={year} onChange={(event) => setYearSafe(Number(event.target.value))} aria-label="Год исторической карты" />
              <div className={styles.marks} aria-hidden="true">
                {snapshotYears.map((value) => <i key={value} style={{ left: `${((value - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100}%` }} />)}
              </div>
            </div>
            <span>{TERRITORY_MAX_YEAR}</span>
          </div>
        </section>
      </section>
    </main>
  );
}
