import type { ModuleDefinition } from './types';

export const moduleRegistry: ModuleDefinition[] = [
  { id: 'ruler-hero', purpose: 'Идентификация правителя и вход в его исторический мир.', status: 'provisional' },
  { id: 'reign-snapshot', purpose: 'Краткая ориентация: годы, статус, ключевые параметры правления.', status: 'provisional' },
  { id: 'historical-context', purpose: 'Что происходило вокруг момента вступления во власть.', status: 'provisional' },
  { id: 'territory-map', purpose: 'Территория и её изменение во времени.', status: 'provisional' },
  { id: 'key-events', purpose: 'Главные события правления.', status: 'provisional' },
  { id: 'reforms', purpose: 'Изменения внутреннего устройства.', status: 'provisional' },
  { id: 'foreign-policy', purpose: 'Дипломатия и внешние отношения.', status: 'provisional' },
  { id: 'wars', purpose: 'Войны и кампании.', status: 'provisional' },
  { id: 'state-institutions', purpose: 'Как менялось государство и институты.', status: 'provisional' },
  { id: 'society', purpose: 'Общество и повседневность.', status: 'provisional' },
  { id: 'economy', purpose: 'Экономика и ресурсы.', status: 'provisional' },
  { id: 'culture', purpose: 'Культура, наука, архитектура.', status: 'provisional' },
  { id: 'personal-dimension', purpose: 'Личность без превращения страницы в биографический журнал.', status: 'provisional' },
  { id: 'documents-quotes', purpose: 'Первичные документы и высказывания.', status: 'provisional' },
  { id: 'gallery', purpose: 'Артефакты и визуальные свидетельства.', status: 'provisional' },
  { id: 'historiography', purpose: 'Споры, оценки и изменение исторической интерпретации.', status: 'provisional' },
  { id: 'legacy', purpose: 'Последствия правления.', status: 'provisional' },
  { id: 'succession', purpose: 'Передача власти и переход к следующему историческому состоянию.', status: 'provisional' }
];
