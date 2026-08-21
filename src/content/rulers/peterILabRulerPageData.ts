import { assertCompleteRulerPageData } from './validateCompleteRulerPageData';
import type { RulerPageData } from './pageModel';

const peterIData = {
  structureRevision: 2,
  id: 'peter-i',
  slug: 'peter-i',
  visualStateKey: 'imperial',
  rail: [
    { id: 'fyodor-iii', name: 'Фёдор III', years: '1676–1682', portraitLabel: 'Ф III' },
    { id: 'sophia', name: 'Софья Алексеевна', years: 'регент 1682–1689', portraitLabel: 'С А' },
    { id: 'ivan-v', name: 'Иван V', years: 'соправитель 1682–1696', portraitLabel: 'И V' },
    { id: 'peter-i', name: 'Пётр I', years: '1682–1725', active: true, portraitLabel: 'П I' },
    { id: 'catherine-i', name: 'Екатерина I', years: '1725–1727', portraitLabel: 'Е I' },
    { id: 'peter-ii', name: 'Пётр II', years: '1727–1730', portraitLabel: 'П II' },
    { id: 'anna', name: 'Анна Иоанновна', years: '1730–1740', portraitLabel: 'А И' },
    { id: 'elizabeth', name: 'Елизавета Петровна', years: '1741–1761', portraitLabel: 'Е П' }
  ],
  hero: {
    datesLabel: '1682–1725',
    displayName: 'ПЁТР I',
    summary: 'Первый российский император: создал регулярную армию и флот, перестроил государственное управление, основал Санкт-Петербург и добился выхода России к Балтийскому морю.',
    imageAssetId: null,
    imageFallbackLabel: 'Пётр I · море, флот и новая имперская столица',
    meta: [
      { id: 'context', label: 'ДИНАСТИЯ', value: 'Романовы' },
      { id: 'status', label: 'СТАТУС', value: 'Царь · с 1721 император' },
      { id: 'capital', label: 'СТОЛИЦА', value: 'Москва → Санкт-Петербург' },
      { id: 'duration', label: 'ПРАВЛЕНИЕ', value: '43 года · единолично с 1696' }
    ],
    keyEvents: [
      { id: 'ke1', year: '1697–1698', title: 'Великое посольство и изучение европейских технологий' },
      { id: 'ke2', year: '1700–1721', title: 'Северная война со Швецией' },
      { id: 'ke3', year: '1703', title: 'Основание Санкт-Петербурга' },
      { id: 'ke4', year: '1709', title: 'Победа русской армии под Полтавой' },
      { id: 'ke5', year: '1721', title: 'Провозглашение Российской империи' }
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
    summary: 'При Петре Россия закрепилась на Балтике: в ходе Северной войны были заняты земли по Неве и в Прибалтике, где возник Санкт-Петербург. Азовские походы дали кратковременный выход к Азовскому морю, а Персидский поход расширил влияние на западном побережье Каспия.',
    legend: [
      { id: 'l1', label: 'Русское царство к началу самостоятельного правления Петра', type: 'base' },
      { id: 'l2', label: 'Балтийские приобретения по итогам Северной войны', type: 'gain' },
      { id: 'l3', label: 'Граница Российской империи к 1725 году', type: 'end' },
      { id: 'l4', label: 'Южные и каспийские направления походов и временных приобретений', type: 'dependent' }
    ]
  },
  map: {
    ariaLabel: 'Схема основных территориальных направлений России при Петре I',
    primaryLabel: 'Россия к началу петровского правления',
    changeLabel: 'Балтийские приобретения и новые направления экспансии',
    places: [
      { id: 'moscow', label: 'Москва', x: 390, y: 225, kind: 'capital' },
      { id: 'saint-petersburg', label: 'Санкт-Петербург', x: 315, y: 155, kind: 'capital' },
      { id: 'baltic', label: 'Балтийское побережье', x: 235, y: 135, kind: 'region' },
      { id: 'azov', label: 'Азов', x: 420, y: 292, kind: 'campaign' },
      { id: 'caspian', label: 'Дербент · Баку', x: 575, y: 280, kind: 'campaign' }
    ]
  },
  facts: [
    { id: 'f1', label: 'Дата рождения', value: '9 июня 1672' },
    { id: 'f2', label: 'Место рождения', value: 'Москва' },
    { id: 'f3', label: 'Родители', value: 'Алексей Михайлович и Наталья Нарышкина' },
    { id: 'f4', label: 'Начало царствования', value: '1682 · вместе с Иваном V' },
    { id: 'f5', label: 'Единоличное правление', value: 'с 1696 года' },
    { id: 'f6', label: 'Императорский титул', value: 'с 1721 года' },
    { id: 'f7', label: 'Династия', value: 'Романовы' },
    { id: 'f8', label: 'Вера', value: 'Православие' },
    { id: 'f9', label: 'Государство', value: 'Русское царство → Российская империя' },
    { id: 'f10', label: 'Конец правления', value: '8 февраля 1725' }
  ],
  thematic: [
    {
      id: 'reforms',
      type: 'list',
      title: 'РЕФОРМЫ',
      dateLabel: '1690-е — 1720-е годы',
      items: [
        { year: '1708', title: 'Губернская реформа и новое административное деление' },
        { year: '1711', title: 'Учреждение Правительствующего сената' },
        { year: '1717–1721', title: 'Замена приказов коллегиями' },
        { year: '1721', title: 'Святейший синод вместо патриаршего управления церковью' },
        { year: '1722', title: 'Табель о рангах и новая система государственной службы' }
      ],
      actionLabel: 'Все реформы →'
    },
    {
      id: 'conflicts',
      type: 'image',
      title: 'ВОЙНЫ И КАМПАНИИ',
      dateLabel: '1695–1724',
      summary: 'Азовские походы, Северная война, Прутский поход и Персидский поход сделали военную реформу центральной частью правления. Главный результат — победа над Швецией и закрепление России на Балтике.',
      mediaLabel: 'Полтава · Балтика · регулярная армия и флот',
      actionLabel: 'Все конфликты →'
    },
    {
      id: 'people',
      type: 'diagram',
      title: 'ЛЮДИ И ВЛАСТЬ',
      dateLabel: 'сподвижники и преемственность',
      diagram: {
        centerLabel: 'Пётр I',
        nodes: ['Александр Меншиков', 'Фёдор Апраксин', 'Яков Брюс', 'Екатерина I']
      },
      actionLabel: 'Все персоны →'
    },
    {
      id: 'legacy',
      type: 'mixed',
      title: 'НАСЛЕДИЕ',
      dateLabel: 'после 1725 года',
      summary: 'Имперский статус России, Санкт-Петербург как новая столица, регулярная армия и флот, коллегиальная бюрократия, Сенат и новая модель служебной карьеры продолжили определять государство после смерти Петра.',
      mediaLabel: 'Санкт-Петербург · флот · имперские институты',
      actionLabel: 'Всё о наследии →'
    }
  ],
  timeline: {
    title: 'ХРОНОЛОГИЯ ПРАВЛЕНИЯ',
    previous: { name: 'Фёдор III · затем регентство Софьи и соправительство Ивана V' },
    next: { name: 'Екатерина I' },
    events: [
      { id: 't1', date: '1682', title: 'Пётр провозглашён царём вместе с Иваном V' },
      { id: 't2', date: '1696', title: 'Начало единоличного правления; взятие Азова' },
      { id: 't3', date: '1697', title: 'Начало Великого посольства' },
      { id: 't4', date: '1700', title: 'Начало Северной войны' },
      { id: 't5', date: '1703', title: 'Основание Санкт-Петербурга' },
      { id: 't6', date: '1709', title: 'Полтавская победа' },
      { id: 't7', date: '1711', title: 'Учреждение Сената' },
      { id: 't8', date: '1721', title: 'Ништадтский мир и провозглашение империи' },
      { id: 't9', date: '1722', title: 'Табель о рангах; начало Персидского похода' },
      { id: 't10', date: '1725', title: 'Смерть Петра I; престол переходит Екатерине I' }
    ]
  },
  sources: [
    {
      id: 'prlib-biography',
      title: 'Президентская библиотека — «Родился первый российский император Пётр I Великий»',
      url: 'https://www.prlib.ru/history/619299',
      supports: ['biography', 'reign', 'territory', 'reforms', 'empire', 'timeline']
    },
    {
      id: 'prlib-northern-war',
      title: 'Президентская библиотека — «Началась Северная война»',
      url: 'https://www.prlib.ru/history/619494',
      supports: ['conflicts', 'territory', 'saint-petersburg', 'poltava', 'timeline']
    },
    {
      id: 'prlib-reforms',
      title: 'Президентская библиотека — «Пётр I: реформы»',
      url: 'https://static.prlib.ru/petr/05.html',
      supports: ['great-embassy', 'reforms', 'education', 'army', 'fleet']
    },
    {
      id: 'spb-founding',
      title: 'Администрация Санкт-Петербурга — история основания города',
      url: 'https://www.gov.spb.ru/gov/terr/reg_petrograd/information/istoricheskaya-spravka/',
      supports: ['saint-petersburg', 'neva', 'territory', 'timeline']
    }
  ]
} satisfies RulerPageData;

export const peterILabRulerPageData = assertCompleteRulerPageData(peterIData, 'Peter I Test Lab');
