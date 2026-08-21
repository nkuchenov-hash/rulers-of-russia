'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './territory-map.module.css';

type Projection = 'globe' | 'mercator';
type FocusMode = 'event' | 'all';
type EventType = 'base' | 'control' | 'legal' | 'loss';

type HistoricalEvent = {
  year: number;
  type: EventType;
  title: string;
  caption: string;
  text: string;
  tags: string[];
  focus: [zoom: number, lat: number, lon: number];
};

const MIN_YEAR = 1682;
const MAX_YEAR = 1725;

const EVENTS: HistoricalEvent[] = [
  { year: 1682, type: 'base', title: '1682 · Исходная граница', caption: 'начало эпохи', text: 'Исходное состояние для сравнения. Геометрия берётся из исторического слоя на выбранную дату.', tags: ['исходное состояние'], focus: [3, 58, 54] },
  { year: 1696, type: 'control', title: '1696 · Взятие Азова', caption: 'Азов переходит под фактический контроль России', text: 'Азов взят русскими войсками в 1696 году. Это изменение фактического контроля; международное признание русского владения Азовом последует по Константинопольскому миру 1700 года.', tags: ['de facto', 'Азов'], focus: [6.2, 47.1, 39.4] },
  { year: 1700, type: 'legal', title: '1700 · Константинопольский мир', caption: 'Османская империя признаёт владение России Азовом', text: 'Договор 1700 года закрепил за Россией Азов и прилегающий район. Для юридической границы это более корректная точка изменения, чем сам штурм 1696 года.', tags: ['de jure', 'Азов'], focus: [6, 47.1, 39.4] },
  { year: 1703, type: 'control', title: '1703 · Нева и Ингрия', caption: 'фактический контроль в районе Невы', text: 'В ходе Северной войны Россия закрепляется на Неве и основывает Санкт-Петербург. Это военный контроль над шведской Ингрией; международно-правовая передача будет оформлена только в 1721 году.', tags: ['de facto', 'Ингрия', 'Северная война'], focus: [6.2, 59.75, 30.2] },
  { year: 1710, type: 'control', title: '1710 · Эстляндия и Лифляндия', caption: 'капитуляция шведских балтийских провинций', text: 'Эстляндия и Лифляндия капитулируют перед Россией. До Ништадтского мира это фактическое российское управление территориями, которые Швеция формально ещё не уступила.', tags: ['de facto', 'Эстляндия', 'Лифляндия'], focus: [5.2, 57.8, 25.3] },
  { year: 1711, type: 'loss', title: '1711 · Прутский мир', caption: 'Россия обязуется вернуть Азов Османской империи', text: 'После Прутского похода Россия обязалась вернуть Азов с прилегающей территорией и ликвидировать ряд южных укреплений. Южное приобретение Петровской эпохи откатывается.', tags: ['утрата', 'Азов', 'de jure'], focus: [6, 47.1, 39.4] },
  { year: 1721, type: 'legal', title: '1721 · Ништадтский мир', caption: 'изменение границы по Ништадтскому миру', text: 'Швеция уступила России Эстляндию, Лифляндию, Ингрию и часть Карелии. Это изменение международно признанной границы, а не только военный контроль.', tags: ['de jure', 'Балтика'], focus: [4.8, 58.8, 28.2] },
  { year: 1722, type: 'control', title: '1722 · Персидский поход', caption: 'Дербент занят русскими войсками', text: 'Российские войска занимают Дербент; начинается новый каспийский слой территориальных изменений. В 1722 году речь прежде всего о фактическом контроле.', tags: ['de facto', 'Каспий', 'Дербент'], focus: [5.3, 42.3, 48] },
  { year: 1723, type: 'legal', title: '1723 · Петербургский договор с Персией', caption: 'крупное каспийское территориальное приобретение', text: 'По договору 1723 года к России отходили Дербент, Баку, Гилян, Мазендеран и Астрабад. При этом реальный российский контроль над частью южнокаспийских территорий был уже, чем юридическая формулировка договора.', tags: ['de jure', 'Каспий', 'контроль ≠ договор'], focus: [4.3, 40.7, 49.3] },
  { year: 1724, type: 'legal', title: '1724 · Русско-османское разграничение', caption: 'каспийские приобретения сохраняются', text: 'Русско-османское соглашение закрепляет раздел сфер влияния в регионе; каспийские владения остаются в российской сфере. Карта показывает состояние исторического слоя на 1724 год.', tags: ['de jure', 'Кавказ', 'Каспий'], focus: [4.4, 41.4, 48.2] },
  { year: 1725, type: 'base', title: '1725 · Конец правления Петра I', caption: 'территориальный итог эпохи', text: 'Финальная точка правления: балтийские приобретения 1721 года плюс каспийские приобретения начала 1720-х. Последние будут возвращены Персии уже после смерти Петра.', tags: ['итог эпохи'], focus: [3.2, 53, 51] }
];

const TYPE_LABEL: Record<EventType, string> = { base: 'Состояние карты', control: 'Фактический контроль', legal: 'Юридическая граница', loss: 'Утрата территории' };

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

function buildOhmUrl(year: number, projection: Projection, focusMode: FocusMode) {
  const event = eventAt(year) ?? previousEvent(year);
  const eventFocus = event.focus;
  const focus: [number, number, number] = focusMode === 'all'
    ? projection === 'globe' ? [2.15, 58, 58] : [2.8, 57, 58]
    : projection === 'globe' ? [Math.min(eventFocus[0], 3.15), eventFocus[1], eventFocus[2]] : eventFocus;
  const [zoom, lat, lon] = focus;
  return `https://embed.openhistoricalmap.org/#map=${zoom}/${lat}/${lon}&date=${year}&layer=O&projection=${projection}&language=ru`;
}

export function PeterTerritoryMap() {
  const [year, setYear] = useState(1721);
  const [mapYear, setMapYear] = useState(1721);
  const [projection, setProjection] = useState<Projection>('globe');
  const [focusMode, setFocusMode] = useState<FocusMode>('event');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setMapYear(year), 240);
    return () => window.clearTimeout(id);
  }, [year]);

  useEffect(() => { setLoading(true); }, [mapYear, projection, focusMode]);

  const exactEvent = eventAt(year);
  const activeEvent = exactEvent ?? previousEvent(year);
  const mapUrl = useMemo(() => buildOhmUrl(mapYear, projection, focusMode), [mapYear, projection, focusMode]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}><span>✦</span>Правители России</div>
        <nav className={styles.nav} aria-label="Основная навигация"><span>Правители</span><span>Эпохи</span><span>События</span><span className={styles.navActive}>Территория</span><span>Источники</span></nav>
        <div className={styles.sourceBadge}>историческая геометрия · OpenHistoricalMap</div>
      </header>

      <section className={styles.shell}>
        <div className={styles.heroRow}>
          <div><p className={styles.eyebrow}>Исторический атлас · экспериментальный route</p><h1>Петровская эпоха: границы по годам</h1><p className={styles.subtitle}>1682–1725 · год меняет сам исторический геослой, а не нарисованный поверх карты полигон</p></div>
          <div className={styles.heroActions}><button className={focusMode === 'event' ? styles.actionActive : styles.action} onClick={() => setFocusMode('event')}>Фокус по событию</button><button className={focusMode === 'all' ? styles.actionActive : styles.action} onClick={() => setFocusMode('all')}>Вся Россия</button></div>
        </div>

        <section className={styles.atlas}>
          <div className={styles.mapbar}>
            <div className={styles.toolbarGroup}>
              <div className={styles.segmented} aria-label="Проекция карты"><button className={projection === 'globe' ? styles.segmentActive : ''} onClick={() => setProjection('globe')}>Глобус</button><button className={projection === 'mercator' ? styles.segmentActive : ''} onClick={() => setProjection('mercator')}>Плоская карта</button></div>
              <div className={styles.legend}><span><i className={styles.legendLegal} />юридическое изменение</span><span><i className={styles.legendControl} />фактический контроль</span><span><i className={styles.legendLoss} />утрата</span></div>
            </div>
            <div className={styles.dataStatus}><span>OHM Historical · <b>date={mapYear}</b></span><a href={mapUrl} target="_blank" rel="noreferrer">Открыть исходный слой ↗</a></div>
          </div>

          <div className={styles.mapStage}>
            {loading && <div className={styles.loader}>Загружаю реальные датированные границы {mapYear}…</div>}
            <iframe className={styles.mapFrame} src={mapUrl} title={`OpenHistoricalMap — ${mapYear}`} onLoad={() => setLoading(false)} allowFullScreen />
            <div className={styles.yearPlate}><strong>{year}</strong><span>выбранный год</span></div>
            <article className={styles.eventCard}><div className={styles.eventType}>{exactEvent ? TYPE_LABEL[activeEvent.type] : 'Между событиями'}</div><h2>{exactEvent ? activeEvent.title : `${year} · граница между подтверждёнными событиями`}</h2><p>{exactEvent ? activeEvent.text : `В нашей шкале нет отдельного события смены статуса в ${year} году. Карта при этом всё равно запрашивает исторический слой именно на ${year} год.`}</p><div className={styles.tags}>{(exactEvent ? activeEvent.tags : ['без нового события']).map((tag, index) => <span key={tag} className={`${styles.tag} ${index === 0 ? styles[`tag_${activeEvent.type}`] : ''}`}>{tag}</span>)}</div></article>
          </div>

          <div className={styles.timelinePanel}>
            <div className={styles.timelineHeading}><strong>Год карты</strong><span>{exactEvent ? `${activeEvent.year} · ${activeEvent.caption}` : `${year} · состояние между зафиксированными событиями`}</span></div>
            <div className={styles.rangeRow}><span>1682</span><input type="range" min={MIN_YEAR} max={MAX_YEAR} step={1} value={year} onChange={(event) => setYear(Number(event.target.value))} aria-label="Год исторической карты" /><span>1725</span></div>
            <div className={styles.marks}>{EVENTS.filter((item) => item.year !== MIN_YEAR && item.year !== MAX_YEAR).map((item) => { const left = ((item.year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100; const isActive = item.year === year; return <button key={item.year} className={`${styles.mark} ${styles[`mark_${item.type}`]} ${isActive ? styles.markActive : ''}`} style={{ left: `${left}%` }} onClick={() => setYear(item.year)} title={item.title} aria-label={item.title}><i /><span>{item.year}</span></button>; })}</div>
          </div>

          <div className={styles.factGrid}>
            <section><span>Что поменялось технически</span><h3>Геометрия больше не рисуется нами</h3><p>Route передаёт выбранный год напрямую в OpenHistoricalMap. Источник фильтрует датированные объекты по времени; наша страница управляет только годом, проекцией и фокусом.</p></section>
            <section><span>Что было пропущено раньше</span><h3>1723: Каспийское расширение</h3><p>В шкалу включены Дербент, Баку и южнокаспийские приобретения Петровской эпохи — поэтому итог 1725 года не сводится к одной Балтике.</p></section>
            <section><span>Что ещё нужно для production</span><h3>Курируемый слой поверх OHM</h3><p>OpenHistoricalMap — датированная реальная геобаза, но не академический арбитр. В финальном продукте спорные участки должны иметь source ID, confidence и раздельные de jure / de facto статусы.</p></section>
          </div>
        </section>

        <div className={styles.sources}><span>Проверка хронологии:</span><a href="https://old.bigenc.ru/domestic_history/text/3170407" target="_blank" rel="noreferrer">Прутский мир 1711 · БРЭ</a><a href="https://rm.shm.ru/core/event/13" target="_blank" rel="noreferrer">Персидский поход 1722–1723 · ГИМ</a><a href="https://www.iranicaonline.org/articles/russia-i-relations/" target="_blank" rel="noreferrer">Русско-иранские отношения · Encyclopaedia Iranica</a></div>
      </section>
    </main>
  );
}
