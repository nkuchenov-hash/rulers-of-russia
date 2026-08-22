'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { FilterSpecification, Map, StyleSpecification } from 'maplibre-gl';
import { constrainFilterByDateRange, dateRangeFromISODate } from '@openhistoricalmap/maplibre-gl-dates';
import styles from './territory-map.module.css';

type Projection = 'globe' | 'mercator';
type Delta = 'gain' | 'loss' | 'none';

type BoundaryState = {
  year: number;
  title: string;
  note: string;
  delta: Delta;
};

const MIN_YEAR = 1682;
const MAX_YEAR = 1725;
const OHM_ADMIN_TILES = 'https://vtiles.openhistoricalmap.org/maps/ohm_admin/{z}/{x}/{y}.pbf';
const WORLD_LAND = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@ca96624a/geojson/ne_110m_land.geojson';
const LOCAL_GLOBE_STYLE: StyleSpecification = {
  version: 8,
  name: 'Rulers of Russia · Historical Globe Base',
  sources: {},
  layers: [
    {
      id: 'ocean',
      type: 'background',
      paint: { 'background-color': '#071a22' }
    }
  ]
};

const BOUNDARY_STATES: BoundaryState[] = [
  { year: 1682, title: 'Исходная территория', note: 'Граница Русского царства в начале правления Петра I', delta: 'none' },
  { year: 1700, title: 'Азов закреплён за Россией', note: 'Изменение южной границы после Константинопольского мира', delta: 'gain' },
  { year: 1711, title: 'Возврат Азова', note: 'Южная граница откатывается после Прутского мира', delta: 'loss' },
  { year: 1721, title: 'Ништадтский мир', note: 'Ингрия, Эстляндия, Лифляндия и часть Карелии входят в состав России', delta: 'gain' },
  { year: 1723, title: 'Каспийские приобретения', note: 'К России отходят Дербент, Баку и территории южного побережья Каспия', delta: 'gain' },
  { year: 1725, title: 'Итог Петровской эпохи', note: 'Территориальное состояние к окончанию правления Петра I', delta: 'none' }
];

const RUSSIA_IDENTITY_FILTER: FilterSpecification = [
  'all',
  ['match', ['to-string', ['get', 'admin_level']], ['1', '2'], true, false],
  [
    'any',
    ['==', ['coalesce', ['get', 'wikidata'], ''], 'Q186096'],
    ['==', ['coalesce', ['get', 'wikidata'], ''], 'Q34266'],
    ['match', ['coalesce', ['get', 'name:en'], ''], ['Tsardom of Russia', 'Russian Tsardom', 'Russian Empire'], true, false],
    ['match', ['coalesce', ['get', 'name:ru'], ''], ['Русское царство', 'Российское царство', 'Российская империя', 'Российская Империя'], true, false],
    ['match', ['coalesce', ['get', 'name'], ''], ['Tsardom of Russia', 'Russian Tsardom', 'Russian Empire', 'Русское царство', 'Российское царство', 'Российская империя', 'Российская Империя'], true, false]
  ]
];

function stateAt(year: number) {
  let result = BOUNDARY_STATES[0];
  for (const state of BOUNDARY_STATES) {
    if (state.year <= year) result = state;
    else break;
  }
  return result;
}

function exactState(year: number) {
  return BOUNDARY_STATES.find((state) => state.year === year);
}

function previousStateYear(year: number) {
  let previous = MIN_YEAR;
  for (const state of BOUNDARY_STATES) {
    if (state.year < year) previous = state.year;
    else break;
  }
  return previous;
}

function historicalFilter(year: number): FilterSpecification {
  return constrainFilterByDateRange(
    RUSSIA_IDENTITY_FILTER,
    dateRangeFromISODate(`${year}-12-31`)
  );
}

function addVisualBase(map: Map) {
  if (!map.getSource('world-land')) {
    map.addSource('world-land', { type: 'geojson', data: WORLD_LAND });
  }
  if (!map.getLayer('world-land-fill')) {
    map.addLayer({
      id: 'world-land-fill',
      type: 'fill',
      source: 'world-land',
      paint: { 'fill-color': '#59645d', 'fill-opacity': 0.72 }
    });
  }
  if (!map.getLayer('world-land-edge')) {
    map.addLayer({
      id: 'world-land-edge',
      type: 'line',
      source: 'world-land',
      paint: { 'line-color': '#899189', 'line-width': 0.55, 'line-opacity': 0.42 }
    });
  }
}

function addTerritoryLayers(map: Map) {
  if (!map.getSource('ohm-admin')) {
    map.addSource('ohm-admin', {
      type: 'vector',
      tiles: [OHM_ADMIN_TILES],
      attribution: '© OpenHistoricalMap contributors'
    });
  }

  map.addLayer({ id: 'russia-loss', type: 'fill', source: 'ohm-admin', 'source-layer': 'boundaries', paint: { 'fill-color': '#b86655', 'fill-opacity': 0 } });
  map.addLayer({ id: 'russia-current', type: 'fill', source: 'ohm-admin', 'source-layer': 'boundaries', paint: { 'fill-color': '#6f8169', 'fill-opacity': 0.68 } });
  map.addLayer({ id: 'russia-gain', type: 'fill', source: 'ohm-admin', 'source-layer': 'boundaries', paint: { 'fill-color': '#d0ac61', 'fill-opacity': 0 } });
  map.addLayer({ id: 'russia-previous-cover', type: 'fill', source: 'ohm-admin', 'source-layer': 'boundaries', paint: { 'fill-color': '#6f8169', 'fill-opacity': 0 } });
  map.addLayer({
    id: 'russia-previous-border',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#f1d28c',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.2, 7, 2.3],
      'line-opacity': 0,
      'line-dasharray': [3, 2]
    }
  });
  map.addLayer({
    id: 'russia-border-halo',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#efe7d4',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 4.2, 7, 8],
      'line-opacity': 0.6
    }
  });
  map.addLayer({
    id: 'russia-border',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#142c36',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.4, 7, 4.8],
      'line-opacity': 1
    }
  });
}

function applyTerritoryState(map: Map, year: number) {
  const exact = exactState(year);
  const current = historicalFilter(year);
  const previous = historicalFilter(previousStateYear(year));

  map.setFilter('russia-current', current);
  map.setFilter('russia-gain', current);
  map.setFilter('russia-border-halo', current);
  map.setFilter('russia-border', current);
  map.setFilter('russia-loss', previous);
  map.setFilter('russia-previous-cover', previous);
  map.setFilter('russia-previous-border', previous);

  map.setPaintProperty('russia-current', 'fill-opacity', 0.68);
  map.setPaintProperty('russia-gain', 'fill-opacity', 0);
  map.setPaintProperty('russia-loss', 'fill-opacity', 0);
  map.setPaintProperty('russia-previous-cover', 'fill-opacity', 0);
  map.setPaintProperty('russia-previous-border', 'line-opacity', exact && exact.year !== MIN_YEAR ? 0.9 : 0);

  if (exact?.delta === 'gain') {
    map.setPaintProperty('russia-current', 'fill-opacity', 0.1);
    map.setPaintProperty('russia-gain', 'fill-opacity', 0.9);
    map.setPaintProperty('russia-previous-cover', 'fill-opacity', 0.82);
  }
  if (exact?.delta === 'loss') {
    map.setPaintProperty('russia-loss', 'fill-opacity', 0.82);
    map.setPaintProperty('russia-current', 'fill-opacity', 0.88);
  }
}

export function PeterTerritoryMap() {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const playTimerRef = useRef<number | null>(null);

  const [year, setYear] = useState(1721);
  const [projection, setProjection] = useState<Projection>('globe');
  const [ready, setReady] = useState(false);
  const [sourceIssue, setSourceIssue] = useState(false);
  const [engineIssue, setEngineIssue] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const activeState = useMemo(() => stateAt(year), [year]);
  const exact = useMemo(() => exactState(year), [year]);

  useEffect(() => {
    if (!mapNodeRef.current || mapRef.current) return;

    let map: Map | null = null;
    const startupGuard = window.setTimeout(() => {
      setReady(true);
      setEngineIssue((current) => current ?? 'Глобус не ответил вовремя. Хронология остаётся доступной.');
    }, 1800);

    try {
      map = new maplibregl.Map({
        container: mapNodeRef.current,
        style: LOCAL_GLOBE_STYLE,
        center: [56, 58],
        zoom: 2.35,
        pitch: 0,
        bearing: 0,
        attributionControl: false
      });

      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');

      map.on('error', (event) => {
        const message = String(event.error?.message ?? '');
        if (message.includes('openhistoricalmap') || message.includes('ohm_admin') || message.includes('vtiles')) {
          setSourceIssue(true);
        }
      });

      map.on('load', () => {
        window.clearTimeout(startupGuard);
        setReady(true);

        try {
          map?.setProjection({ type: 'globe' });
          if (map) addVisualBase(map);
        } catch (error) {
          setEngineIssue(`Базовая сцена запущена с ограничениями: ${error instanceof Error ? error.message : 'ошибка визуального слоя'}`);
        }

        try {
          if (map) {
            addTerritoryLayers(map);
            applyTerritoryState(map, year);
          }
        } catch (error) {
          setSourceIssue(true);
          setEngineIssue((current) => current ?? `Исторический слой не загрузился: ${error instanceof Error ? error.message : 'ошибка слоя'}`);
        }
      });
    } catch (error) {
      window.clearTimeout(startupGuard);
      setReady(true);
      setEngineIssue(`WebGL-сцена не запустилась: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    }

    return () => {
      window.clearTimeout(startupGuard);
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer('russia-current')) return;
    try {
      applyTerritoryState(map, year);
    } catch (error) {
      setSourceIssue(true);
      setEngineIssue((current) => current ?? `Не удалось обновить границу: ${error instanceof Error ? error.message : 'ошибка слоя'}`);
    }
  }, [year, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    try {
      map.setProjection({ type: projection });
      map.easeTo({
        center: projection === 'globe' ? [56, 58] : [58, 57],
        zoom: projection === 'globe' ? 2.35 : 2.7,
        duration: 950
      });
    } catch (error) {
      setEngineIssue((current) => current ?? `Не удалось переключить проекцию: ${error instanceof Error ? error.message : 'ошибка движка'}`);
    }
  }, [projection, ready]);

  useEffect(() => {
    if (!playing) {
      if (playTimerRef.current) window.clearInterval(playTimerRef.current);
      playTimerRef.current = null;
      return;
    }
    playTimerRef.current = window.setInterval(() => {
      setYear((current) => {
        if (current >= MAX_YEAR) {
          setPlaying(false);
          return MIN_YEAR;
        }
        return current + 1;
      });
    }, 520);
    return () => {
      if (playTimerRef.current) window.clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    };
  }, [playing]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  async function toggleFullscreen() {
    if (!sceneRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await sceneRef.current.requestFullscreen();
  }

  function jumpToYear(nextYear: number) {
    setPlaying(false);
    setYear(nextYear);
  }

  return (
    <main className={styles.page} data-territory-build="runtime-fallback-20260822">
      <section ref={sceneRef} className={styles.scene}>
        <div ref={mapNodeRef} className={styles.map} aria-label="Интерактивная карта территории России Петровской эпохи" />
        <div className={styles.vignette} aria-hidden="true" />
        <div className={styles.grain} aria-hidden="true" />

        {!ready && (
          <div
            className={styles.loading}
            style={{
              inset: 'auto',
              top: 86,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'block',
              placeItems: 'initial',
              width: 'auto',
              height: 'auto',
              padding: '9px 13px',
              border: '1px solid rgba(235,222,193,.2)',
              borderRadius: 999,
              background: 'rgba(7,27,37,.78)',
              backdropFilter: 'blur(12px)',
              pointerEvents: 'none',
              zIndex: 6
            }}
          >
            Запускаем глобус…
          </div>
        )}
        {ready && (sourceIssue || engineIssue) && (
          <div style={{ position: 'absolute', top: 78, left: '50%', transform: 'translateX(-50%)', zIndex: 12, maxWidth: 'min(760px, calc(100% - 32px))', padding: '10px 14px', border: '1px solid rgba(223,188,120,.45)', background: 'rgba(18,31,36,.9)', color: '#eadfca', borderRadius: 999, backdropFilter: 'blur(10px)', textAlign: 'center', fontSize: 12, fontWeight: 600 }}>
            {engineIssue ?? 'Исторический слой границ сейчас недоступен. Хронология и глобус продолжают работать.'}
          </div>
        )}

        <header className={styles.topbar}>
          <div className={styles.identity}>
            <span className={styles.brandMark}>✦</span>
            <div><b>Правители России</b><small>Территориальная хронология</small></div>
          </div>
          <div className={styles.topActions}>
            <div className={styles.projectionSwitch}>
              <button className={projection === 'globe' ? styles.activeControl : ''} onClick={() => setProjection('globe')}>Глобус</button>
              <button className={projection === 'mercator' ? styles.activeControl : ''} onClick={() => setProjection('mercator')}>Карта</button>
            </div>
            <button className={styles.fullscreenButton} onClick={toggleFullscreen}>{fullscreen ? 'Свернуть' : 'На весь экран'}</button>
          </div>
        </header>

        <aside className={styles.yearStory}>
          <span className={styles.era}>ПЕТРОВСКАЯ ЭПОХА · 1682–1725</span>
          <div className={styles.heroYear}>{year}</div>
          <div className={styles.stateTitle}>{exact ? exact.title : activeState.title}</div>
          <p>{exact ? exact.note : `Граница после изменения ${activeState.year} года`}</p>
          {exact && exact.delta !== 'none' && (
            <span className={`${styles.changeBadge} ${exact.delta === 'loss' ? styles.lossBadge : styles.gainBadge}`}>
              {exact.delta === 'loss' ? '− изменение территории' : '+ изменение территории'}
            </span>
          )}
        </aside>

        <div className={styles.legend}>
          <span><i className={styles.currentSwatch} />Россия</span>
          <span><i className={styles.gainSwatch} />приобретение</span>
          <span><i className={styles.lossSwatch} />утрата</span>
          <span><i className={styles.previousSwatch} />предыдущая граница</span>
        </div>

        <section className={styles.timeline} aria-label="Хронология изменения границ">
          <div className={styles.timelineHeader}>
            <button className={styles.playButton} onClick={() => setPlaying((value) => !value)}>{playing ? '❚❚' : '▶'}</button>
            <div><b>Изменение территории России</b><span>Перемещайте шкалу или запустите хронологию</span></div>
            <div className={styles.timelineYear}>{year}</div>
          </div>

          <div className={styles.rangeWrap}>
            <span>{MIN_YEAR}</span>
            <input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={year} onChange={(event) => jumpToYear(Number(event.target.value))} aria-label="Год" />
            <span>{MAX_YEAR}</span>
          </div>

          <div className={styles.milestones}>
            {BOUNDARY_STATES.map((state) => {
              const left = ((state.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
              const selected = state.year === year;
              return (
                <button key={state.year} style={{ left: `${left}%` }} className={`${styles.milestone} ${selected ? styles.milestoneActive : ''}`} onClick={() => jumpToYear(state.year)} title={`${state.year}: ${state.title}`}>
                  <i />
                  <span>{state.year}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className={styles.hint}>Тяните, чтобы вращать · колесо — масштаб</div>
      </section>
    </main>
  );
}
