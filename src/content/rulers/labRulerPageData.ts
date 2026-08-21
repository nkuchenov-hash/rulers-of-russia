import type { RulerPageData } from './pageModel';

export const labRulerPageData: RulerPageData = {
  id: 'peter-i',
  slug: 'peter-i',
  visualStateKey: 'imperial',
  rail: [
    { id: 'fyodor-iii', name: 'Фёдор III', years: '1676–1682' },
    { id: 'ivan-v', name: 'Иван V', years: '1682–1696' },
    { id: 'sophia', name: 'Софья Алексеевна', years: 'регент 1682–1689' },
    { id: 'peter-i', name: 'Пётр I', years: '1682–1725', active: true },
    { id: 'catherine-i', name: 'Екатерина I', years: '1725–1727' },
    { id: 'peter-ii', name: 'Пётр II', years: '1727–1730' },
    { id: 'anna', name: 'Анна Иоанновна', years: '1730–1740' },
    { id: 'elizabeth', name: 'Елизавета Петровна', years: '1741–1761' }
  ],
  hero: {
    datesLabel: '1672–1725 · ПРАВЛЕНИЕ 1682–1725',
    displayName: 'ПЁТР I',
    summary: 'Царь, а затем первый российский император, радикально перестроивший государство и закрепивший Россию как европейскую державу.',
    imageAssetId: null,
    meta: [
      { id: 'context', label: 'ДИНАСТИЯ', value: 'Романовы' },
      { id: 'status', label: 'СТАТУС', value: 'Царь · Император' },
      { id: 'capital', label: 'СТОЛИЦА', value: 'Москва → Санкт-Петербург' },
      { id: 'duration', label: 'ПРАВЛЕНИЕ', value: '43 года' }
    ],
    keyEvents: [
      { id: 'ke1', year: '1697–1698', title: 'Великое посольство' },
      { id: 'ke2', year: '1700–1721', title: 'Северная война' },
      { id: 'ke3', year: '1703', title: 'Основание Санкт-Петербурга' },
      { id: 'ke4', year: '1721', title: 'Провозглашение Российской империи' }
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
    summary: 'Главный территориальный результат правления — выход к Балтийскому морю и закрепление России на северо-западе после победы в Северной войне.',
    legend: [
      { id: 'l1', label: 'Русское царство к началу правления', type: 'base' },
      { id: 'l2', label: 'Территории, закреплённые по Ништадтскому миру', type: 'gain' },
      { id: 'l3', label: 'Граница Российской империи к 1725 году', type: 'end' },
      { id: 'l4', label: 'Зоны военного и дипломатического влияния', type: 'dependent' }
    ]
  },
  facts: [
    { id: 'f1', label: 'Дата рождения', value: '9 июня 1672' },
    { id: 'f2', label: 'Место рождения', value: 'Москва' },
    { id: 'f3', label: 'Приход к власти', value: '1682' },
    { id: 'f4', label: 'Конец правления', value: '8 февраля 1725' },
    { id: 'f5', label: 'Династия', value: 'Романовы' },
    { id: 'f6', label: 'Вера', value: 'Православие' },
    { id: 'f7', label: 'Государство', value: 'Русское царство → Российская империя' }
  ],
  thematic: [
    {
      id: 'reforms',
      type: 'list',
      title: 'РЕФОРМЫ',
      dateLabel: 'конец XVII — первая четверть XVIII века',
      items: [
        { year: '1708', title: 'Губернская реформа' },
        { year: '1711', title: 'Учреждение Правительствующего сената' },
        { year: '1718–1721', title: 'Создание коллегий' },
        { year: '1721', title: 'Учреждение Святейшего синода' },
        { year: '1722', title: 'Табель о рангах' }
      ],
      actionLabel: 'Все реформы →'
    },
    {
      id: 'conflicts',
      type: 'image',
      title: 'ВОЙНЫ И КАМПАНИИ',
      dateLabel: '1695–1724',
      summary: 'Азовские походы, Северная война и Персидский поход превратили военную модернизацию в один из главных двигателей преобразований.',
      mediaLabel: 'Тематическое изображение военной эпохи Петра I',
      actionLabel: 'Все конфликты →'
    },
    {
      id: 'people',
      type: 'diagram',
      title: 'ЛЮДИ И ВЛАСТЬ',
      dateLabel: 'ближний круг и преемственность',
      actionLabel: 'Все персоны →'
    },
    {
      id: 'legacy',
      type: 'mixed',
      title: 'НАСЛЕДИЕ',
      dateLabel: 'после 1725 года',
      summary: 'Имперский статус, новая столица, регулярная армия и флот, бюрократические институты и новая модель государственной службы пережили самого Петра.',
      mediaLabel: 'Образ петровского Санкт-Петербурга и новой имперской России',
      actionLabel: 'Всё о наследии →'
    }
  ],
  timeline: {
    title: 'ХРОНОЛОГИЯ ПРАВЛЕНИЯ',
    previous: { name: 'Иван V / регентство Софьи' },
    next: { name: 'Екатерина I' },
    events: [
      { id: 't1', date: '1682', title: 'Начало царствования' },
      { id: 't2', date: '1697', title: 'Начало Великого посольства' },
      { id: 't3', date: '1703', title: 'Основание Санкт-Петербурга' },
      { id: 't4', date: '1709', title: 'Полтавская победа' },
      { id: 't5', date: '1721', title: 'Провозглашение императором' },
      { id: 't6', date: '1725', title: 'Конец правления' }
    ]
  }
};
