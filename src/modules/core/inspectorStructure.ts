import type { CoreInspectableId, CoreModuleId } from './inspectorPassports';

export interface InspectorTreeNode {
  label: string;
  id?: CoreInspectableId;
  targetSelector?: string;
  children?: InspectorTreeNode[];
}

const node = (
  label: string,
  id?: CoreInspectableId,
  targetSelector?: string,
  children?: InspectorTreeNode[]
): InspectorTreeNode => ({ label, id, targetSelector, children });

export const inspectorTrees: Record<CoreModuleId, InspectorTreeNode> = {
  background: node('Фон страницы', 'background', '[data-module-id="background"]', [
    node('Фоновая иллюстрация', 'background-artwork', '[data-element-id="background-artwork"]')
  ]),

  header: node('Верхняя шапка', 'header', '[data-module-id="header"]', [
    node('Название сайта', 'header-brand', '[data-element-id="header-brand"]'),
    node('Главная навигация', undefined, undefined, [
      node('Пункт меню ×6', 'header-nav-item', '[data-element-id="header-nav-item"]')
    ]),
    node('Поиск', 'header-search', '[data-element-id="header-search"]'),
    node('Переключатель эпохи', 'header-hvs', '[data-element-id="header-hvs"]'),
    node('Меню', 'header-menu', '[data-element-id="header-menu"]')
  ]),

  'historical-rail': node('Левая историческая шкала', 'historical-rail', '[data-module-id="historical-rail"]', [
    node('Кнопки управления', 'rail-control', '[data-element-id="rail-control"]'),
    node('Карточка правителя', 'rail-item', '[data-element-id="rail-item"]', [
      node('Мини-портрет', 'rail-portrait', '[data-element-id="rail-portrait"]'),
      node('Имя', 'rail-name', '[data-element-id="rail-name"]'),
      node('Годы правления', 'rail-dates', '[data-element-id="rail-dates"]')
    ])
  ]),

  hero: node('Hero-блок', 'hero', '[data-module-id="hero"]', [
    node('Цельная Hero-картинка', 'hero-image', '[data-element-id="hero-image"]'),
    node('Градиент Hero', 'hero-gradient', '[data-element-id="hero-gradient"]'),
    node('Контент', undefined, undefined, [
      node('Годы жизни / правления', 'hero-dates', '[data-element-id="hero-dates"]'),
      node('Имя правителя', 'hero-name', '[data-element-id="hero-name"]'),
      node('Короткое описание', 'hero-summary', '[data-element-id="hero-summary"]'),
      node('Метаданные', undefined, undefined, [
        node('Династия / контекст', 'hero-meta-item', '.hero-meta > div:nth-child(1)'),
        node('Статус', 'hero-meta-item', '.hero-meta > div:nth-child(2)'),
        node('Столица', 'hero-meta-item', '.hero-meta > div:nth-child(3)'),
        node('Длительность правления', 'hero-meta-item', '.hero-meta > div:nth-child(4)')
      ])
    ]),
    node('Ключевые события', 'key-events', '[data-module-id="key-events"]', [
      node('Событие 1', 'key-event-row', '.key-event:nth-of-type(1)'),
      node('Событие 2', 'key-event-row', '.key-event:nth-of-type(2)'),
      node('Событие 3', 'key-event-row', '.key-event:nth-of-type(3)'),
      node('Событие 4', 'key-event-row', '.key-event:nth-of-type(4)'),
      node('Смотреть все', 'key-events-all', '[data-element-id="key-events-all"]')
    ]),
    node('Служебные действия', 'hero-action', '[data-element-id="hero-action"]')
  ]),

  'key-events': node('Ключевые события', 'key-events', '[data-module-id="key-events"]', [
    node('Строка события ×4', 'key-event-row', '[data-element-id="key-event-row"]'),
    node('Смотреть все', 'key-events-all', '[data-element-id="key-events-all"]')
  ]),

  'page-tabs': node('Навигация по странице', 'page-tabs', '[data-module-id="page-tabs"]', [
    node('Обзор', 'page-tab', '.page-tabs button:nth-child(1)'),
    node('Территория', 'page-tab', '.page-tabs button:nth-child(2)'),
    node('Реформы', 'page-tab', '.page-tabs button:nth-child(3)'),
    node('Конфликты', 'page-tab', '.page-tabs button:nth-child(4)'),
    node('Наследие', 'page-tab', '.page-tabs button:nth-child(5)'),
    node('Материалы', 'page-tab', '.page-tabs button:nth-child(6)')
  ]),

  territory: node('Территория', 'territory', '[data-module-id="territory"]', [
    node('Короткое объяснение', 'territory-summary', '[data-element-id="territory-summary"]'),
    node('Легенда карты', undefined, undefined, [
      node('Исходная территория', 'territory-legend-item', '.territory-legend > div:nth-child(1)'),
      node('Присоединённые земли', 'territory-legend-item', '.territory-legend > div:nth-child(2)'),
      node('Граница к концу правления', 'territory-legend-item', '.territory-legend > div:nth-child(3)'),
      node('Зависимые / спорные территории', 'territory-legend-item', '.territory-legend > div:nth-child(4)')
    ]),
    node('Карта эпохи', 'territory-map-action', '[data-element-id="territory-map-action"]')
  ]),

  map: node('Историческая карта', 'map', '[data-module-id="map"]', [
    node('Полотно карты', 'map-canvas', '[data-element-id="map-canvas"]'),
    node('Основная граница', 'map-boundary-layer', '[data-element-id="map-boundary-layer"]'),
    node('Изменение границы', 'map-change-layer', '[data-element-id="map-change-layer"]'),
    node('Подписи мест', 'map-place-label', '[data-element-id="map-place-label"]'),
    node('Управление картой', 'map-controls', '[data-element-id="map-controls"]')
  ]),

  facts: node('Факты', 'facts', '[data-module-id="facts"]', [
    node('Строка факта ×7', 'fact-row', '[data-element-id="fact-row"]'),
    node('Все факты', 'facts-all', '[data-element-id="facts-all"]')
  ]),

  'thematic-card': node('Тематические карточки', 'thematic-card', '[data-module-id="thematic-card"]', [
    node('Заголовок карточки', 'thematic-title', '[data-element-id="thematic-title"]'),
    node('Период / дата', 'thematic-date', '[data-element-id="thematic-date"]'),
    node('Элемент списка', 'thematic-list-item', '[data-element-id="thematic-list-item"]'),
    node('Описание', 'thematic-summary', '[data-element-id="thematic-summary"]'),
    node('Изображение', 'thematic-image', '[data-element-id="thematic-image"]'),
    node('Диаграмма', 'thematic-diagram', '[data-element-id="thematic-diagram"]'),
    node('Действие', 'thematic-action', '[data-element-id="thematic-action"]')
  ]),

  'reign-timeline': node('Хронология правления', 'reign-timeline', '[data-module-id="reign-timeline"]', [
    node('Предыдущий правитель', 'timeline-previous', '[data-element-id="timeline-previous"]'),
    node('Заголовок', 'timeline-title', '[data-element-id="timeline-title"]'),
    node('Ось времени', 'timeline-axis', '[data-element-id="timeline-axis"]'),
    node('Событие ×6', 'timeline-event', '[data-element-id="timeline-event"]', [
      node('Дата события', 'timeline-event-date', '[data-element-id="timeline-event-date"]')
    ]),
    node('Следующий правитель', 'timeline-next', '[data-element-id="timeline-next"]')
  ])
};

const moduleIds = Object.keys(inspectorTrees) as CoreModuleId[];

function containsId(node: InspectorTreeNode, id: CoreInspectableId): boolean {
  if (node.id === id) return true;
  return node.children?.some((child) => containsId(child, id)) ?? false;
}

export function owningModuleFor(id: CoreInspectableId): CoreModuleId {
  if ((moduleIds as string[]).includes(id)) return id as CoreModuleId;
  return moduleIds.find((moduleId) => containsId(inspectorTrees[moduleId], id)) ?? 'hero';
}
