import type { RulerPageData } from './pageModel';

// Neutral fixture used by the generic Core skeleton.
// It must never encode a specific historical ruler.
export const labRulerPageData: RulerPageData = {
  structureRevision: 2,
  id: 'generic-ruler',
  slug: 'generic-ruler',
  visualStateKey: 'core',
  rail: [
    { id: 'r1', name: 'Правитель I', years: 'год—год', portraitLabel: 'I' },
    { id: 'r2', name: 'Правитель II', years: 'год—год', portraitLabel: 'II' },
    { id: 'r3', name: 'Правитель III', years: 'год—год', portraitLabel: 'III' },
    { id: 'active', name: 'ТЕКУЩИЙ ПРАВИТЕЛЬ', years: 'начало—конец', active: true, portraitLabel: '●' },
    { id: 'r5', name: 'Правитель V', years: 'год—год', portraitLabel: 'V' },
    { id: 'r6', name: 'Правитель VI', years: 'год—год', portraitLabel: 'VI' },
    { id: 'r7', name: 'Правитель VII', years: 'год—год', portraitLabel: 'VII' },
    { id: 'r8', name: 'Правитель VIII', years: 'год—год', portraitLabel: 'VIII' }
  ],
  hero: {
    datesLabel: 'ГОДЫ ПРАВЛЕНИЯ',
    displayName: 'ИМЯ ПРАВИТЕЛЯ',
    summary: 'Короткая формула правления — 1–2 строки, объясняющие роль и историческое значение текущего правителя.',
    imageAssetId: null,
    imageFallbackLabel: 'Историческое изображение правителя',
    meta: [
      { id: 'context', label: 'ДИНАСТИЯ / КОНТЕКСТ', value: 'значение' },
      { id: 'status', label: 'СТАТУС', value: 'значение' },
      { id: 'capital', label: 'СТОЛИЦА', value: 'значение' },
      { id: 'duration', label: 'ПРАВЛЕНИЕ', value: 'значение' }
    ],
    keyEvents: [
      { id: 'ke1', year: 'год', title: 'Ключевое событие 1' },
      { id: 'ke2', year: 'год', title: 'Ключевое событие 2' },
      { id: 'ke3', year: 'год', title: 'Ключевое событие 3' },
      { id: 'ke4', year: 'год', title: 'Ключевое событие 4' }
    ]
  },
  tabs: [
    { id: 'overview', label: 'Обзор', enabled: true },
    { id: 'territory', label: 'Территория', enabled: true },
    { id: 'reforms', label: 'Реформы', enabled: true },
    { id: 'conflicts', label: 'Конфликты', enabled: true },
    { id: 'legacy', label: 'Наследие', enabled: true },
    { id: 'materials', label: 'Материалы', enabled: false }
  ],
  territory: {
    summary: 'Короткое объяснение того, как менялась территория во время правления и что должно быть видно на карте.',
    legend: [
      { id: 'l1', label: 'Исходная территория', type: 'base' },
      { id: 'l2', label: 'Присоединённые земли', type: 'gain' },
      { id: 'l3', label: 'Граница к концу правления', type: 'end' },
      { id: 'l4', label: 'Зависимые / спорные территории', type: 'dependent' }
    ]
  },
  map: {
    ariaLabel: 'Схема территориальных изменений при правителе',
    primaryLabel: 'Основная территория',
    changeLabel: 'Изменение границы',
    places: [
      { id: 'capital', label: 'Столица', x: 400, y: 225, kind: 'capital' },
      { id: 'region-a', label: 'Регион', x: 245, y: 155, kind: 'region' },
      { id: 'region-b', label: 'Новое направление', x: 565, y: 160, kind: 'region' },
      { id: 'campaign', label: 'Военное направление', x: 480, y: 285, kind: 'campaign' }
    ]
  },
  facts: [
    { id: 'f1', label: 'Дата рождения', value: 'значение' },
    { id: 'f2', label: 'Место рождения', value: 'значение' },
    { id: 'f3', label: 'Приход к власти', value: 'значение' },
    { id: 'f4', label: 'Конец правления', value: 'значение' },
    { id: 'f5', label: 'Династия / группа', value: 'значение' },
    { id: 'f6', label: 'Вера / идеология', value: 'значение' },
    { id: 'f7', label: 'Государство', value: 'значение' }
  ],
  thematic: [
    {
      id: 'reforms',
      type: 'list',
      title: 'РЕФОРМЫ',
      dateLabel: 'период темы',
      items: [
        { year: 'год', title: 'Элемент 1' },
        { year: 'год', title: 'Элемент 2' },
        { year: 'год', title: 'Элемент 3' },
        { year: 'год', title: 'Элемент 4' },
        { year: 'год', title: 'Элемент 5' }
      ],
      actionLabel: 'Все реформы →'
    },
    {
      id: 'conflicts',
      type: 'image',
      title: 'КОНФЛИКТЫ',
      dateLabel: 'период темы',
      summary: 'Короткое описание тематического блока.',
      mediaLabel: 'Историческое изображение темы',
      actionLabel: 'Все конфликты →'
    },
    {
      id: 'people',
      type: 'diagram',
      title: 'ЛЮДИ И ВЛАСТЬ',
      dateLabel: 'контекст',
      diagram: { centerLabel: 'Текущий правитель', nodes: ['Союзник', 'Военачальник', 'Советник', 'Преемник'] },
      actionLabel: 'Все персоны →'
    },
    {
      id: 'legacy',
      type: 'mixed',
      title: 'НАСЛЕДИЕ',
      dateLabel: 'период влияния',
      summary: 'Короткое описание долговременного наследия правления.',
      mediaLabel: 'Историческое изображение темы',
      actionLabel: 'Всё о наследии →'
    }
  ],
  timeline: {
    title: 'ХРОНОЛОГИЯ ПРАВЛЕНИЯ',
    previous: { name: 'Предыдущий правитель' },
    next: { name: 'Следующий правитель' },
    events: [
      { id: 't1', date: 'начало', title: 'Начало правления' },
      { id: 't2', date: 'год', title: 'Событие 1' },
      { id: 't3', date: 'год', title: 'Событие 2' },
      { id: 't4', date: 'год', title: 'Событие 3' },
      { id: 't5', date: 'год', title: 'Событие 4' },
      { id: 't6', date: 'конец', title: 'Конец правления' }
    ]
  },
  sources: []
};
