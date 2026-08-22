'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type FilterSpecification, type Map } from 'maplibre-gl';
import {
  constrainFilterByDateRange,
  dateRangeFromISODate,
  filterByDate
} from '@openhistoricalmap/maplibre-gl-dates';
import styles from './territory-map.module.css';

type Projection = 'globe' | 'mercator';
type FocusMode = 'event' | 'all';
type EventType = 'base' | 'control' | 'legal' | 'loss';
type Delta = 'gain' | 'loss' | 'none';
type PolygonState = 'loading' | 'ok' | 'missing';

type HistoricalEvent = {
  year: number;
  type: EventType;
  delta: Delta;
  title: string;
  caption: string;
  text: string;
  tags: string[];
  focus: [zoom: number, lat: number, lon: number];
};

const MIN_YEAR = 1682;
const MAX_YEAR = 1725;
const OHM_STYLE = 'https://www.openhistoricalmap.org/map-styles/main/main.json';
const OHM_ADMIN_TILES = 'https://vtiles.openhistoricalmap.org/maps/ohm_admin/{z}/{x}/{y}.pbf';

const EVENTS: HistoricalEvent[] = [
  { year: 1682, type: 'base', delta: 'none', title: '1682 · Исходная граница', caption: 'начало эпохи', text: 'Исходное состояние для сравнения. Зелёным показана территория государства на выбранную дату.', tags: ['государственная граница'], focus: [3, 58, 54] },
  { year: 1696, type: 'control', delta: 'none', title: '1696 · Взятие Азова', caption: 'Азов переходит под фактический контроль России', text: 'Азов взят русскими войсками в 1696 году. Это изменение фактического контроля; международное признание русского владения последует в 1700 году.', tags: ['de facto', 'Азов'], focus: [6.2, 47.1, 39.4] },
  { year: 1700, type: 'legal', delta: 'gain', title: '1700 · Константинопольский мир', caption: 'Османская империя признаёт владение России Азовом', text: 'Договор 1700 года закрепил за Россией Азов и прилегающий район. Золотым показана часть текущей геометрии, которой не было в предыдущем годовом срезе.', tags: ['de jure', 'приобретение', 'Азов'], focus: [6, 47.1, 39.4] },
  { year: 1703, type: 'control', delta: 'none', title: '1703 · Нева и Ингрия', caption: 'фактический контроль в районе Невы', text: 'Россия закрепляется на Неве и основывает Санкт-Петербург. Это военный контроль над шведской Ингрией; международно-правовая передача будет оформлена в 1721 году.', tags: ['de facto', 'Ингрия', 'Северная война'], focus: [6.2, 59.75, 30.2] },
  { year: 1710, type: 'control', delta: 'none', title: '1710 · Эстляндия и Лифляндия', caption: 'капитуляция шведских балтийских провинций', text: 'Эстляндия и Лифляндия капитулируют перед Россией. До Ништадтского мира это фактическое управление территориями, которые Швеция формально ещё не уступила.', tags: ['de facto', 'Эстляндия', 'Лифляндия'], focus: [5.2, 57.8, 25.3] },
  { year: 1711, type: 'loss', delta: 'loss', title: '1711 · Прутский мир', caption: 'Россия обязуется вернуть Азов Османской империи', text: 'После Прутского похода Россия обязалась вернуть Азов. Терракотовым показана территория предыдущего среза, отсутствующая в текущей государственной границе.', tags: ['утрата', 'Азов', 'de jure'], focus: [6, 47.1, 39.4] },
  { year: 1721, type: 'legal', delta: 'gain', title: '1721 · Ништадтский мир', caption: 'изменение границы по Ништадтскому миру', text: 'Швеция уступила России Эстляндию, Лифляндию, Ингрию и часть Карелии. Новая часть государственной территории выделяется золотым, а граница предыдущего года остаётся пунктиром.', tags: ['de jure', 'приобретение', 'Балтика'], focus: [4.8, 58.8, 28.2] },
  { year: 1722, type: 'control', delta: 'none', title: '1722 · Персидский поход', caption: 'Дербент занят русскими войсками', text: 'Российские войска занимают Дербент. В 1722 году речь прежде всего о фактическом контроле; государственная заливка остаётся юридической, чтобы не смешивать разные статусы.', tags: ['de facto', 'Каспий', 'Дербент'], focus: [5.3, 42.3, 48] },
  { year: 1723, type: 'legal', delta: 'gain', title: '1723 · Петербургский договор с Персией', caption: 'крупное каспийское территориальное приобретение', text: 'По договору к России отходили Дербент, Баку, Гилян, Мазендеран и Астрабад. Карта визуально сравнивает юридическую геометрию 1723 и 1722 годов.', tags: ['de jure', 'приобретение', 'Каспий'], focus: [4.3, 40.7, 49.3] },
  { year: 1724, type: 'legal', delta: 'none', title: '1724 · Русско-османское разграничение', caption: 'каспийские приобретения сохраняются', text: 'Русско-османское соглашение закрепляет раздел сфер влияния в регионе; выбранный год показывает состояние исторического административного слоя OHM.', tags: ['de jure', 'Кавказ', 'Каспий'], focus: [4.4, 41.4, 48.2] },
  { year: 1725, type: 'base', delta: 'none', title: '1725 · Конец правления Петра I', caption: 'территориальный итог эпохи', text: 'Финальная точка правления: балтийские приобретения 1721 года и каспийские приобретения начала 1720-х. Сильная линия показывает внешнюю границу текущего среза.', tags: ['итог эпохи'], focus: [3.2, 53, 51] }
];

const TYPE_LABEL: Record<EventType, string> = {
  base: 'Государственная территория',
  control: 'Фактический контроль',
  legal: 'Юридическая граница',
  loss: 'Утрата территории'
};

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

function previousEvent(year: number) {
  let result = EVENTS[0];
  for (const item of EVENTS) {
    if (item.year <= year) result = item;
    else break;
  }
  return result;
}

function eventAt(year: number) {
  return EVENTS.find((item) => item.year === year);
}

function historicalFilter(year: number): FilterSpecification {
  return constrainFilterByDateRange(
    RUSSIA_IDENTITY_FILTER,
    dateRangeFromISODate(`${year}-12-31`)
  );
}

function isRussiaProperties(properties: Record<string, unknown> | null | undefined) {
  if (!properties) return false;
  const wikidata = String(properties.wikidata ?? '');
  const name = String(properties['name:en'] ?? properties['name:ru'] ?? properties.name ?? '');
  return wikidata === 'Q186096' || wikidata === 'Q34266' || /Tsardom of Russia|Russian Tsardom|Russian Empire|Русское царство|Российское царство|Российская империя/i.test(name);
}

function addTerritoryLayers(map: Map) {
  if (!map.getSource('ohm-admin')) {
    map.addSource('ohm-admin', {
      type: 'vector',
      tiles: [OHM_ADMIN_TILES],
      attribution: '© OpenHistoricalMap contributors'
    });
  }

  const firstSymbolLayer = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  const before = firstSymbolLayer;

  map.addLayer({
    id: 'russia-loss',
    type: 'fill',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: { 'fill-color': '#9a574b', 'fill-opacity': 0, 'fill-antialias': true }
  }, before);

  map.addLayer({
    id: 'russia-core',
    type: 'fill',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: { 'fill-color': '#516c5b', 'fill-opacity': 0.66, 'fill-antialias': true }
  }, before);

  map.addLayer({
    id: 'russia-gain',
    type: 'fill',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: { 'fill-color': '#c9a85b', 'fill-opacity': 0, 'fill-antialias': true }
  }, before);

  map.addLayer({
    id: 'russia-previous-cover',
    type: 'fill',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: { 'fill-color': '#516c5b', 'fill-opacity': 0, 'fill-antialias': true }
  }, before);

  map.addLayer({
    id: 'russia-previous-border',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#e3c883',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.1, 7, 2.1],
      'line-opacity': 0.82,
      'line-dasharray': [3, 2]
    }
  }, before);

  map.addLayer({
    id: 'russia-current-border-halo',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#f5ead1',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 3.5, 7, 7],
      'line-opacity': 0.7
    }
  }, before);

  map.addLayer({
    id: 'russia-current-border',
    type: 'line',
    source: 'ohm-admin',
    'source-layer': 'boundaries',
    paint: {
      'line-color': '#08283b',
      'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.1, 7, 4.3],
      'line-opacity': 0.98
    }
  }, before);
}

function applyTerritoryState(map: Map, year: number, delta: Delta) {
  const current = historicalFilter(year);
  const previous = historicalFilter(Math.max(MIN_YEAR - 1, year - 1));

  map.setFilter('russia-core', current);
  map.setFilter('russia-gain', current);
  map.setFilter('russia-current-border-halo', current);
  map.setFilter('russia-current-border', current);
  map.setFilter('russia-loss', previous);
  map.setFilter('russia-previous-cover', previous);
  map.setFilter('russia-previous-border', previous);

  if (delta === 'gain') {
    map.setPaintProperty('russia-core', 'fill-opacity', 0.08);
    map.setPaintProperty('russia-gain', 'fill-opacity', 0.82);
    map.setPaintProperty('russia-previous-cover', 'fill-opacity', 0.82);
    map.setPaintProperty('russia-loss', 'fill-opacity', 0);
  } else if (delta === 'loss') {
    map.setPaintProperty('russia-core', 'fill-opacity', 0.78);
    map.setPaintProperty('russia-gain', 'fill-opacity', 0);
    map.setPaintProperty('russia-previous-cover', 'fill-opacity', 0);
    map.setPaintProperty('russia-loss', 'fill-opacity', 0.82);
  } else {
    map.setPaintProperty('russia-core', 'fill-opacity', 0.66);
    map.setPaintProperty('russia-gain', 'fill-opacity', 0);
    map.setPaintProperty('russia-previous-cover', 'fill-opacity', 0);
    map.setPaintProperty('russia-loss', 'fill-opacity', 0);
  }
}

function cameraFor(year: number, projection: Projection, focusMode: FocusMode) {
  const item = eventAt(year) ?? previousEvent(year);
  if (focusMode === 'all') {
    return projection === 'globe'
      ? { center: [62, 58] as [number, number], zoom: 2.05 }
      : { center: [61, 57] as [number, number], zoom: 2.65 };
  }
  const [zoom, lat, lon] = item.focus;
  return {
    center: [lon, lat] as [number, number],
    zoom: projection === 'globe' ? Math.min(zoom, 3.25) : zoom
  };
}

export function PeterTerritoryMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [year, setYear] = useState(1721);
  const [projection, setProjection] = useState<Projection>('globe');
  const [focusMode, setFocusMode] = useState<FocusMode>('event');
  const [mapReady, setMapReady] = useState(false);
  const [polygonState, setPolygonState] = useState<PolygonState>('loading');

  const exactEvent = eventAt(year);
  const activeEvent = exactEvent ?? previousEvent(year);
  const delta = exactEvent?.delta ?? 'none';
  const sourceMapUrl = useMemo(() => {
    const camera = cameraFor(year, projection, focusMode);
    return `https://embed.openhistoricalmap.org/#map=${camera.zoom}/${camera.center[1]}/${camera.center[0]}&date=${year}&layer=O&projection=${projection}&language=ru`;
  }, [year, projection, focusMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialCamera = cameraFor(1721, 'globe', 'event');
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OHM_STYLE,
      center: initialCamera.center,
      zoom: initialCamera.zoom,
      projection: { type: 'globe' },
      attributionControl: false
    });

    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      filterByDate(map, '1721-12-31');
      addTerritoryLayers(map);
      applyTerritoryState(map, 1721, 'gain');
      setMapReady(true);
    });

    map.on('idle', () => {
      if (!map.getSource('ohm-admin')) return;
      const matches = map
        .querySourceFeatures('ohm-admin', { sourceLayer: 'boundaries' })
        .filter((feature) => isRussiaProperties(feature.properties));
      setPolygonState(matches.length > 0 ? 'ok' : 'missing');
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    setPolygonState('loading');
    filterByDate(map, `${year}-12-31`);
    applyTerritoryState(map, year, delta);
    const camera = cameraFor(year, projection, focusMode);
    map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 720 });
  }, [year, delta, focusMode, mapReady, projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setProjection({ type: projection });
  }, [projection, mapReady]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><span>✦</span>Правители России</div>
        <nav className={styles.nav} aria-label="Основная навигация"><span>Правители</span><span>Эпохи</span><span>События</span><span className={styles.navActive}>Территория</span><span>Источники</span></nav>
        <div className={styles.sourceBadge}>OHM · реальные датированные полигоны</div>
      </header>

      <section className={styles.shell}>
        <div className={styles.heroRow}>
          <div>
            <p className={styles.eyebrow}>Исторический атлас · Петровская эпоха</p>
            <h1>Границы России по годам</h1>
            <p className={styles.subtitle}>1682–1725 · зелёным — государство, золотым — приобретение, терракотовым — утрата, пунктиром — граница предыдущего года</p>
          </div>
          <div className={styles.heroActions}>
            <button className={focusMode === 'event' ? styles.actionActive : styles.action} onClick={() => setFocusMode('event')}>Фокус по событию</button>
            <button className={focusMode === 'all' ? styles.actionActive : styles.action} onClick={() => setFocusMode('all')}>Вся Россия</button>
          </div>
        </div>

        <section className={styles.atlas}>
          <div className={styles.mapbar}>
            <div className={styles.toolbarGroup}>
              <div className={styles.segmented} aria-label="Проекция карты">
                <button className={projection === 'globe' ? styles.segmentActive : ''} onClick={() => setProjection('globe')}>Глобус</button>
                <button className={projection === 'mercator' ? styles.segmentActive : ''} onClick={() => setProjection('mercator')}>Плоская карта</button>
              </div>
              <div className={styles.legend}>
                <span><i className={styles.legendCore} />Россия · текущий год</span>
                <span><i className={styles.legendGain} />приобретено</span>
                <span><i className={styles.legendLoss} />утрачено</span>
                <span><i className={styles.legendPrevious} />предыдущая граница</span>
              </div>
            </div>
            <div className={styles.dataStatus}>
              <span className={polygonState === 'ok' ? styles.statusOk : polygonState === 'missing' ? styles.statusWarn : styles.statusLoading}>
                {polygonState === 'ok' ? '● исторический полигон найден' : polygonState === 'missing' ? '● полигон не найден в видимых тайлах' : '● проверяю геометрию'}
              </span>
              <a href={sourceMapUrl} target="_blank" rel="noreferrer">Исходная OHM-карта ↗</a>
            </div>
          </div>

          <div className={styles.mapStage}>
            {!mapReady && <div className={styles.loader}>Загружаю исторические полигоны и границы…</div>}
            <div ref={containerRef} className={styles.mapCanvas} aria-label={`Историческая карта России, ${year} год`} />
            <div className={styles.yearPlate}><strong>{year}</strong><span>31 декабря · de jure</span></div>
            <article className={styles.eventCard}>
              <div className={styles.eventType}>{exactEvent ? TYPE_LABEL[activeEvent.type] : 'Состояние между событиями'}</div>
              <h2>{exactEvent ? activeEvent.title : `${year} · государственная граница`}</h2>
              <p>{exactEvent ? activeEvent.text : `В ${year} году на нашей шкале нет отдельного события смены юридической границы. Заливка всё равно строится по историческому срезу именно этого года.`}</p>
              <div className={styles.tags}>{(exactEvent ? activeEvent.tags : ['без нового юридического изменения']).map((tag, index) => <span key={tag} className={`${styles.tag} ${index === 0 ? styles[`tag_${activeEvent.type}`] : ''}`}>{tag}</span>)}</div>
            </article>
          </div>

          <div className={styles.timelinePanel}>
            <div className={styles.timelineHeading}><strong>Год карты</strong><span>{exactEvent ? `${activeEvent.year} · ${activeEvent.caption}` : `${year} · граница на конец года`}</span></div>
            <div className={styles.rangeRow}><span>1682</span><input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Год исторической карты" /><span>1725</span></div>
            <div className={styles.marks}>{EVENTS.filter((item) => item.year !== MIN_YEAR && item.year !== MAX_YEAR).map((item) => { const left = ((item.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100; const isActive = item.year === year; return <button key={item.year} className={`${styles.mark} ${styles[`mark_${item.type}`]} ${isActive ? styles.markActive : ''}`} style={{ left: `${left}%` }} onClick={() => setYear(item.year)} title={item.title} aria-label={item.title}><i /><span>{item.year}</span></button>; })}</div>
          </div>

          <div className={styles.factGrid}>
            <section><span>Текущий срез</span><h3>Государство теперь видно сразу</h3><p>Весь российский административный полигон выбранного года получает одну заливку и сильный внешний контур. Остальная карта остаётся нейтральной.</p></section>
            <section><span>Изменение</span><h3>До / после без нарисованной геометрии</h3><p>Для приобретений текущий и предыдущий исторические полигоны накладываются друг на друга: новая область остаётся золотой. Для утрат предыдущий полигон остаётся терракотовым.</p></section>
            <section><span>Источник</span><h3>OHM admin boundary polygons</h3><p>Заливка использует vector tiles <code>ohm_admin</code>, слой <code>boundaries</code>, с временными полями start/end date. Пунктир — тот же источник за предыдущий год.</p></section>
          </div>
        </section>
      </section>
    </main>
  );
}
