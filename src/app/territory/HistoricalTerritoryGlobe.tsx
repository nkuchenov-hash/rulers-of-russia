'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  geoGraticule10,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  geoCentroid,
  type GeoProjection
} from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import {
  POLITY_TRANSITION_YEARS,
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt
} from './territoryChronology';
import styles from './territory-globe.module.css';

type ViewMode = 'globe' | 'map';
type Rotation = [number, number, number];
type TerritoryFeature = Feature<Geometry, Record<string, unknown>>;
type TerritoryCollection = FeatureCollection<Geometry, Record<string, unknown>>;

type ImportManifest = {
  generated_at?: string;
  source?: string;
  runtime_dependency?: boolean;
  polities?: Array<{
    polity_id: string;
    label: string;
    file: string | null;
    features: number;
    status: string;
  }>;
};

const VIEW_W = 1600;
const VIEW_H = 900;
const GLOBE_CENTER: [number, number] = [1020, 420];
const MAP_CENTER: [number, number] = [860, 420];

const countries = topoFeature(
  countriesTopo as never,
  (countriesTopo as unknown as { objects: { countries: never } }).objects.countries
) as unknown as FeatureCollection<Geometry, { name?: string }>;

const graticule = geoGraticule10();
const sphere = { type: 'Sphere' } as const;

function yearPart(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).match(/-?\d{3,4}/);
  return match ? Number(match[0]) : null;
}

function featureStart(feature: TerritoryFeature) {
  return yearPart(feature.properties?.start_date);
}

function featureEnd(feature: TerritoryFeature) {
  return yearPart(feature.properties?.end_date);
}

function isFeatureValid(feature: TerritoryFeature, year: number) {
  const start = featureStart(feature);
  const end = featureEnd(feature);
  if (start !== null && year < start) return false;
  if (end !== null && year > end) return false;
  return true;
}

function chooseTerritoryFeatures(collection: TerritoryCollection | undefined, year: number) {
  if (!collection?.features.length) return { features: [] as TerritoryFeature[], exact: false, snapshotYear: null as number | null };

  const exact = collection.features.filter((feature) => isFeatureValid(feature, year));
  if (exact.length) {
    const starts = exact.map(featureStart).filter((value): value is number => value !== null);
    return {
      features: exact,
      exact: true,
      snapshotYear: starts.length ? Math.max(...starts) : year
    };
  }

  const previous = collection.features
    .map((feature) => ({ feature, start: featureStart(feature) }))
    .filter((item): item is { feature: TerritoryFeature; start: number } => item.start !== null && item.start <= year)
    .sort((a, b) => b.start - a.start);

  if (!previous.length) return { features: [] as TerritoryFeature[], exact: false, snapshotYear: null as number | null };
  const snapshotYear = previous[0].start;
  return {
    features: previous.filter((item) => item.start === snapshotYear).map((item) => item.feature),
    exact: false,
    snapshotYear
  };
}

function collectionFor(features: TerritoryFeature[]): TerritoryCollection {
  return { type: 'FeatureCollection', features };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function useTerritoryData() {
  const [collections, setCollections] = useState<Record<string, TerritoryCollection>>({});
  const [manifest, setManifest] = useState<ImportManifest | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const root = `${basePath}/data/territory/ohm`;

    async function load() {
      try {
        const manifestResponse = await fetch(`${root}/manifest.json`, { signal: controller.signal, cache: 'no-store' });
        if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
        const nextManifest = (await manifestResponse.json()) as ImportManifest;
        setManifest(nextManifest);

        const entries = (nextManifest.polities ?? []).filter((item) => item.file && item.features > 0);
        const loaded = await Promise.all(
          entries.map(async (item) => {
            const response = await fetch(`${root}/${item.polity_id}.geojson`, { signal: controller.signal, cache: 'force-cache' });
            if (!response.ok) return null;
            return [item.polity_id, (await response.json()) as TerritoryCollection] as const;
          })
        );

        if (controller.signal.aborted) return;
        setCollections(Object.fromEntries(loaded.filter((item): item is readonly [string, TerritoryCollection] => Boolean(item))));
        setStatus('ready');
      } catch {
        if (!controller.signal.aborted) setStatus('missing');
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return { collections, manifest, status };
}

export function HistoricalTerritoryGlobe({ initialYear = 1721 }: { initialYear?: number }) {
  const sceneRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{
    active: boolean;
    x: number;
    y: number;
    rotation: Rotation;
    time: number;
    vx: number;
    vy: number;
  }>({ active: false, x: 0, y: 0, rotation: [-64, -48, 0], time: 0, vx: 0, vy: 0 });
  const inertiaRef = useRef<number | null>(null);

  const [year, setYear] = useState(clamp(initialYear, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  const [viewMode, setViewMode] = useState<ViewMode>('globe');
  const [rotation, setRotation] = useState<Rotation>([-64, -48, 0]);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);
  const [showReferenceBorders, setShowReferenceBorders] = useState(true);

  const { collections, manifest, status } = useTerritoryData();
  const period = territoryPeriodAt(year);
  const selected = chooseTerritoryFeatures(collections[period.polityId], year);

  const snapshotYears = useMemo(() => {
    const years = new Set<number>(POLITY_TRANSITION_YEARS);
    for (const collection of Object.values(collections)) {
      for (const feature of collection.features) {
        const value = featureStart(feature);
        if (value !== null && value >= TERRITORY_MIN_YEAR && value <= TERRITORY_MAX_YEAR) years.add(value);
      }
    }
    years.add(TERRITORY_MAX_YEAR);
    return [...years].sort((a, b) => a - b);
  }, [collections]);

  const projection = useMemo<GeoProjection>(() => {
    if (viewMode === 'map') {
      return geoNaturalEarth1()
        .translate(MAP_CENTER)
        .scale(265 * zoom)
        .precision(0.25);
    }

    return geoOrthographic()
      .translate(GLOBE_CENTER)
      .scale(350 * zoom)
      .rotate(rotation)
      .clipAngle(90)
      .precision(0.2);
  }, [rotation, viewMode, zoom]);

  const path = useMemo(() => geoPath(projection), [projection]);
  const territoryCollection = useMemo(() => collectionFor(selected.features), [selected.features]);
  const territoryPath = selected.features.length ? path(territoryCollection) : null;
  const spherePath = path(sphere as never) ?? '';
  const graticulePath = path(graticule as never) ?? '';

  const stopInertia = useCallback(() => {
    if (inertiaRef.current !== null) cancelAnimationFrame(inertiaRef.current);
    inertiaRef.current = null;
  }, []);

  const focusRussia = useCallback(() => {
    stopInertia();
    const [lon, lat] = period.focus;
    setRotation([-lon, -lat, 0]);
    setZoom(viewMode === 'globe' ? 1 : 0.96);
  }, [period.focus, stopInertia, viewMode]);

  useEffect(() => {
    focusRussia();
  }, [period.polityId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => () => stopInertia(), [stopInertia]);

  function beginDrag(event: React.PointerEvent<SVGSVGElement>) {
    if (viewMode !== 'globe') return;
    stopInertia();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      rotation,
      time: performance.now(),
      vx: 0,
      vy: 0
    };
  }

  function moveDrag(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag.active || viewMode !== 'globe') return;

    const now = performance.now();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const sensitivity = 0.22 / zoom;
    const next: Rotation = [
      drag.rotation[0] + dx * sensitivity,
      clamp(drag.rotation[1] - dy * sensitivity, -78, 78),
      0
    ];

    const dt = Math.max(8, now - drag.time);
    drag.vx = ((event.clientX - drag.x) * sensitivity) / dt;
    drag.vy = (-(event.clientY - drag.y) * sensitivity) / dt;
    setRotation(next);
  }

  function endDrag(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag.active || viewMode !== 'globe') return;
    drag.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    let vx = drag.vx * 16;
    let vy = drag.vy * 16;
    const animate = () => {
      vx *= 0.94;
      vy *= 0.94;
      if (Math.abs(vx) + Math.abs(vy) < 0.015) {
        inertiaRef.current = null;
        return;
      }
      setRotation((current) => [current[0] + vx, clamp(current[1] + vy, -78, 78), 0]);
      inertiaRef.current = requestAnimationFrame(animate);
    };
    inertiaRef.current = requestAnimationFrame(animate);
  }

  function changeZoom(delta: number) {
    setZoom((value) => clamp(value + delta, viewMode === 'globe' ? 0.72 : 0.68, viewMode === 'globe' ? 2.4 : 2));
  }

  function wheelZoom(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.08 : 0.08);
  }

  async function toggleFullscreen() {
    if (!sceneRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await sceneRef.current.requestFullscreen();
  }

  function setYearSafe(next: number) {
    setYear(clamp(Math.round(next), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  }

  function jumpSnapshot(direction: -1 | 1) {
    const candidates = direction > 0 ? snapshotYears.filter((value) => value > year) : snapshotYears.filter((value) => value < year).reverse();
    if (candidates.length) setYearSafe(candidates[0]);
  }

  const sourceLabel = status === 'ready'
    ? `локальный кэш · ${manifest?.source ?? 'historical data'}`
    : status === 'loading'
      ? 'подключаем локальные исторические данные'
      : 'базовый глобус · исторические полигоны ещё не импортированы';

  return (
    <main className={styles.page}>
      <section ref={sceneRef} className={styles.scene}>
        <div className={styles.space} aria-hidden="true" />

        <svg
          className={`${styles.globe} ${viewMode === 'globe' ? styles.globeInteractive : styles.mapInteractive}`}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`Территория: ${period.label}, ${year} год`}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={wheelZoom}
        >
          <defs>
            <radialGradient id="oceanGradient" cx="35%" cy="28%" r="72%">
              <stop offset="0%" stopColor="#183945" />
              <stop offset="52%" stopColor="#0c252e" />
              <stop offset="86%" stopColor="#07161d" />
              <stop offset="100%" stopColor="#030a0e" />
            </radialGradient>
            <radialGradient id="shadeGradient" cx="39%" cy="32%" r="68%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
              <stop offset="52%" stopColor="#07151a" stopOpacity="0" />
              <stop offset="88%" stopColor="#010508" stopOpacity="0.46" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.74" />
            </radialGradient>
            <linearGradient id="russiaGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#d7c08a" />
              <stop offset="42%" stopColor="#aa9b67" />
              <stop offset="100%" stopColor="#69765c" />
            </linearGradient>
            <filter id="atmosphereGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="15" />
            </filter>
            <filter id="territoryGlow" x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="sphereClip">
              <path d={spherePath} />
            </clipPath>
          </defs>

          {viewMode === 'globe' && (
            <>
              <path d={spherePath} className={styles.atmosphereOuter} filter="url(#atmosphereGlow)" />
              <path d={spherePath} fill="url(#oceanGradient)" className={styles.ocean} />
            </>
          )}

          {viewMode === 'map' && <path d={spherePath} className={styles.mapOcean} />}

          <path d={graticulePath} className={styles.graticule} />

          <g clipPath={viewMode === 'globe' ? 'url(#sphereClip)' : undefined}>
            {countries.features.map((country, index) => {
              const d = path(country as never);
              if (!d) return null;
              const name = country.properties?.name ?? `Страна ${index + 1}`;
              return (
                <path
                  key={`${country.id ?? index}`}
                  d={d}
                  className={styles.country}
                  onPointerEnter={() => setHoveredCountry(name)}
                  onPointerLeave={() => setHoveredCountry(null)}
                />
              );
            })}

            {showReferenceBorders && countries.features.map((country, index) => {
              const d = path(country as never);
              return d ? <path key={`border-${country.id ?? index}`} d={d} className={styles.countryBorder} /> : null;
            })}

            {territoryPath && (
              <>
                <path d={territoryPath} className={styles.territoryGlow} filter="url(#territoryGlow)" />
                <path d={territoryPath} fill="url(#russiaGradient)" className={styles.territoryFill} />
                <path d={territoryPath} className={styles.territoryBorderHalo} />
                <path d={territoryPath} className={styles.territoryBorder} />
              </>
            )}
          </g>

          {viewMode === 'globe' && <path d={spherePath} fill="url(#shadeGradient)" className={styles.sphereShade} />}
          {viewMode === 'globe' && <path d={spherePath} className={styles.rim} />}
        </svg>

        <header className={styles.topbar}>
          <div className={styles.brand}>
            <span className={styles.brandSymbol}>Р</span>
            <div>
              <strong>Правители России</strong>
              <span>Исторический глобус</span>
            </div>
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
          <div className={styles.year}>{year}</div>
          <h1>{period.label}</h1>
          <div className={styles.rule} />
          <p>
            {selected.features.length
              ? selected.exact
                ? 'Граница по датированному историческому снапшоту.'
                : `Показан ближайший доступный снапшот ${selected.snapshotYear ?? '—'} года.`
              : 'Исторический слой для этого периода ещё импортируется; географический глобус работает независимо.'}
          </p>
          <div className={styles.source}>{sourceLabel}</div>
        </aside>

        <div className={styles.mapTools}>
          <button onClick={() => changeZoom(0.12)} aria-label="Приблизить">+</button>
          <button onClick={() => changeZoom(-0.12)} aria-label="Отдалить">−</button>
          <button onClick={() => setShowReferenceBorders((value) => !value)} className={showReferenceBorders ? styles.toolActive : ''} title="Контуры стран">◎</button>
        </div>

        {hoveredCountry && <div className={styles.countryTip}>{hoveredCountry}</div>}

        <div className={styles.legend}>
          <span><i className={styles.legendRussia} />территория государства</span>
          <span><i className={styles.legendWorld} />другие страны</span>
          <span><i className={styles.legendBorder} />границы</span>
        </div>

        <section className={styles.timeline} aria-label="Хронология территории России">
          <div className={styles.timelineTop}>
            <button onClick={() => jumpSnapshot(-1)} aria-label="Предыдущее изменение">‹</button>
            <div>
              <strong>{period.shortLabel}</strong>
              <span>{TERRITORY_MIN_YEAR} — {TERRITORY_MAX_YEAR}</span>
            </div>
            <div className={styles.timelineCurrent}>{year}</div>
            <button onClick={() => jumpSnapshot(1)} aria-label="Следующее изменение">›</button>
          </div>

          <div className={styles.rangeRow}>
            <span>{TERRITORY_MIN_YEAR}</span>
            <div className={styles.rangeTrack}>
              <input
                type="range"
                min={TERRITORY_MIN_YEAR}
                max={TERRITORY_MAX_YEAR}
                step={1}
                value={year}
                onChange={(event) => setYearSafe(Number(event.target.value))}
                aria-label="Год исторической карты"
              />
              <div className={styles.marks} aria-hidden="true">
                {snapshotYears.map((value) => (
                  <i key={value} style={{ left: `${((value - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100}%` }} />
                ))}
              </div>
            </div>
            <span>{TERRITORY_MAX_YEAR}</span>
          </div>
        </section>

        <div className={styles.dragHint}>{viewMode === 'globe' ? 'Тяните глобус · колесо — масштаб' : 'Колесо — масштаб · переключитесь на глобус для вращения'}</div>
      </section>
    </main>
  );
}
