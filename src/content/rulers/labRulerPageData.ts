import type { RulerPageData } from './pageModel';

export const labRulerPageData: RulerPageData = {
  id: 'lab-ruler',
  slug: 'lab-ruler',
  visualStateKey: 'core',
  rail: [
    { id: 'r1', name: 'Правитель I', years: 'год—год' },
    { id: 'r2', name: 'Правитель II', years: 'год—год' },
    { id: 'r3', name: 'Правитель III', years: 'год—год' },
    { id: 'active', name: 'ТЕКУЩИЙ ПРАВИТЕЛЬ', years: 'начало—конец правления', active: true },
    { id: 'r5', name: 'Правитель V', years: 'год—год' },
    { id: 'r6', name: 'Правитель VI', years: 'год—год' },
    { id: 'r7', name: 'Правитель VII', years: 'год—год' },
    { id: 'r8', name: 'Правитель VIII', years: 'год—год' }
  ],
  hero: {
    datesLabel: 'ГОДЫ ЖИЗНИ / ПРАВЛЕНИЯ',
    displayName: 'ИМЯ ПРАВИТЕЛЯ',
    summary: 'Короткая формула правления — 1–2 строки, объясняющие роль и историческое значение текущего правителя.',
    imageAssetId: null,
    meta: [
      { id: 'context', label: 'ДИНАСТИЯ / КОНТЕКСТ', value: 'identity.dynastyOrGroup' },
      { id: 'status', label: 'СТАТУС', value: 'identity.primaryTitle' },
      { id: 'capital', label: 'СТОЛИЦА', value: 'reign.capitalPlaceId' },
      { id: 'duration', label: 'ПРАВЛЕНИЕ', value: 'derived.reignDuration' }
    ],
    keyEvents: [
      { id: 'ke1', year: 'год', title: 'Название ключевого события 1' },
      { id: 'ke2', year: 'год', title: 'Название ключевого события 2' },
      { id: 'ke3', year: 'год', title: 'Название ключевого события 3' },
      { id: 'ke4', year: 'год', title: 'Название ключевого события 4' }
    ]
  },
  tabs: [
    { id: 'overview', label: 'Обзор', enabled: true },
    { id: 'territory', label: 'Территория', enabled: true },
    { id: 'reforms', label: 'Реформы', enabled: true },
    { id: 'conflicts', label: 'Конфликты', enabled: true },
    { id: 'legacy', label: 'Наследие', enabled: true },
    { id: 'materials', label: 'Материалы', enabled: true }
  ],
  territory: {
    summary: 'Как менялась территория во время этого правления и что именно нужно увидеть на соседней карте.',
    legend: [
      { id: 'l1', label: 'Исходная территория', type: 'base' },
      { id: 'l2', label: 'Присоединённые земли', type: 'gain' },
      { id: 'l3', label: 'Граница к концу правления', type: 'end' },
      { id: 'l4', label: 'Зависимые / спорные территории', type: 'dependent' }
    ]
  },
  facts: [
    { id: 'f1', label: 'Дата рождения', value: 'identity.birthDate' },
    { id: 'f2', label: 'Место рождения', value: 'identity.birthPlaceId' },
    { id: 'f3', label: 'Приход к власти', value: 'accession.date' },
    { id: 'f4', label: 'Конец правления', value: 'reign.endDate' },
    { id: 'f5', label: 'Династия / партия', value: 'identity.groupId' },
    { id: 'f6', label: 'Вера / идеология', value: 'identity.beliefOrIdeology' },
    { id: 'f7', label: 'Гос. устройство', value: 'polity.formOfGovernment' }
  ],
  thematic: [
    {
      id: 'reforms',
      type: 'list',
      title: 'РЕФОРМЫ',
      dateLabel: 'период темы',
      items: [
        { year: 'год', title: 'Название реформы 1' },
        { year: 'год', title: 'Название реформы 2' },
        { year: 'год', title: 'Название реформы 3' },
        { year: 'год', title: 'Название реформы 4' },
        { year: 'год', title: 'Название реформы 5' }
      ],
      actionLabel: 'Все реформы →'
    },
    {
      id: 'conflicts',
      type: 'image',
      title: 'КОНФЛИКТЫ',
      dateLabel: 'период темы',
      summary: '2–4 строки о конфликтной оси правления.',
      mediaLabel: 'Одобренное изображение темы',
      actionLabel: 'Все конфликты →'
    },
    {
      id: 'people',
      type: 'diagram',
      title: 'ДИНАСТИЯ / ЛЮДИ',
      dateLabel: 'контекст',
      actionLabel: 'Все персоны →'
    },
    {
      id: 'legacy',
      type: 'mixed',
      title: 'НАСЛЕДИЕ',
      dateLabel: 'период влияния',
      summary: 'Что правление оставило следующему периоду и какие последствия оказались долговечными.',
      mediaLabel: 'Изображение наследия',
      actionLabel: 'Всё о наследии →'
    }
  ],
  timeline: {
    title: 'ХРОНОЛОГИЯ ПРАВЛЕНИЯ',
    previous: { name: 'Имя предыдущего' },
    next: { name: 'Имя следующего' },
    events: [
      { id: 't1', date: 'начало', title: 'Начало правления' },
      { id: 't2', date: 'год', title: 'Ключевое событие 1' },
      { id: 't3', date: 'год', title: 'Ключевое событие 2' },
      { id: 't4', date: 'год', title: 'Ключевое событие 3' },
      { id: 't5', date: 'год', title: 'Ключевое событие 4' },
      { id: 't6', date: 'конец', title: 'Конец правления' }
    ]
  }
};
