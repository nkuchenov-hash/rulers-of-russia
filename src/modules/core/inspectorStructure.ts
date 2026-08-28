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

const thematicCardChildren = (index: number): InspectorTreeNode[] => [
  node('Заголовок', 'thematic-title', `.thematic-card:nth-child(${index}) [data-element-id="thematic-title"]`),
  node('Период / дата', 'thematic-date', `.thematic-card:nth-child(${index}) [data-element-id="thematic-date"]`),
  node('Элемент списка', 'thematic-list-item', `.thematic-card:nth-child(${index}) [data-element-id="thematic-list-item"]`),
  node('Описание', 'thematic-summary', `.thematic-card:nth-child(${index}) [data-element-id="thematic-summary"]`),
  node('Изображение', 'thematic-image', `.thematic-card:nth-child(${index}) [data-element-id="thematic-image"]`),
  node('Диаграмма', 'thematic-diagram', `.thematic-card:nth-child(${index}) [data-element-id="thematic-diagram"]`),
  node('Действие', 'thematic-action', `.thematic-card:nth-child(${index}) [data-element-id="thematic-action"]`)
];

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
    node('Текущий правитель', 'rail-active-item', '.rail-item.active', [
      node('Портрет текущего правителя', 'rail-portrait', '.rail-item.active [data-element-id="rail-portrait"]'),
      node('Имя текущего правителя', 'rail-name', '.rail-item.active [data-element-id="rail-name"]'),
      node('Годы правления', 'rail-dates', '.rail-item.active [data-element-id="rail-dates"]')
    ]),
    node('Обычная карточка правителя', 'rail-item', '.rail-item:not(.active)', [
      node('Мини-портрет', 'rail-portrait', '.rail-item:not(.active) [data-element-id="rail-portrait"]'),
      node('Имя', 'rail-name', '.rail-item:not(.active) [data-element-id="rail-name"]'),
      node('Годы правления', 'rail-dates', '.rail-item:not(.active) [data-element-id="rail-dates"]')
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
    node('Цитаты правителя', 'key-events', '[data-module-id="key-events"]', [
      node('Текущая цитата', 'key-event-row', '[data-element-id="key-event-row"]')
    ]),
    node('Служебные действия', 'hero-action', '[data-element-id="hero-action"]')
  ]),

  'key-events': node('Цитаты правителя', 'key-events', '[data-module-id="key-events"]', [
    node('Текущая цитата', 'key-event-row', '[data-element-id="key-event-row"]')
  ]),

  'page-tabs': node('Навигация по странице', 'page-tabs', '[data-module-id="page-tabs"]', [
    node('Обзор', 'page-tab', '.page-tabs button:nth-child(1)'),
    node('Территория', 'page-tab', '.page-tabs button:nth-child(2)'),
    node('Реформы', 'page-tab', '.page-tabs button:nth-child(3)'),
    node('Экономика', 'page-tab', '.page-tabs button:nth-child(4)'),
    node('Войны и дипломатия', 'page-tab', '.page-tabs button:nth-child(5)'),
    node('Культура', 'page-tab', '.page-tabs button:nth-child(6)'),
    node('Личность', 'page-tab', '.page-tabs button:nth-child(7)')
  ]),

  territory: node('Карта правления', 'territory', '[data-module-id="territory"]', [
    node('Что показывает карта', 'territory-summary', '[data-element-id="territory-summary"]'),
    node('Слои карты', undefined, undefined, [
      node('Границы', 'territory-legend-item', '.territory-legend > div:nth-child(1)'),
      node('Войны и походы', 'territory-legend-item', '.territory-legend > div:nth-child(2)'),
      node('Инфраструктура', 'territory-legend-item', '.territory-legend > div:nth-child(3)'),
      node('Города и центры', 'territory-legend-item', '.territory-legend > div:nth-child(4)')
    ]),
    node('Открыть карту эпохи', 'territory-map-action', '[data-element-id="territory-map-action"]')
  ]),

  map: node('Историческая карта', 'map', '[data-module-id="map"]', [
    node('Полотно карты', 'map-canvas', '[data-element-id="map-canvas"]'),
    node('Основная граница', 'map-boundary-layer', '[data-element-id="map-boundary-layer"]'),
    node('Изменение границы', 'map-change-layer', '[data-element-id="map-change-layer"]'),
    node('Подписи мест', 'map-place-label', '[data-element-id="map-place-label"]'),
    node('Управление картой', 'map-controls', '[data-element-id="map-controls"]')
  ]),

  facts: node('Начало → конец правления', 'facts', '[data-module-id="facts"]', [
    node('Сравниваемый показатель ×3–6', 'fact-row', '[data-element-id="fact-row"]')
  ]),

  'thematic-card': node('Ключевые события и явления правления', 'thematic-card', '[data-module-id="thematic-card"]', [
    node('Событие / явление 1', 'thematic-card', '.thematic-card:nth-child(1)', thematicCardChildren(1)),
    node('Событие / явление 2', 'thematic-card', '.thematic-card:nth-child(2)', thematicCardChildren(2)),
    node('Событие / явление 3', 'thematic-card', '.thematic-card:nth-child(3)', thematicCardChildren(3)),
    node('Событие / явление 4', 'thematic-card', '.thematic-card:nth-child(4)', thematicCardChildren(4)),
    node('Событие / явление 5', 'thematic-card', '.thematic-card:nth-child(5)', thematicCardChildren(5)),
    node('Событие / явление 6', 'thematic-card', '.thematic-card:nth-child(6)', thematicCardChildren(6)),
    node('Событие / явление 7', 'thematic-card', '.thematic-card:nth-child(7)', thematicCardChildren(7)),
    node('Событие / явление 8', 'thematic-card', '.thematic-card:nth-child(8)', thematicCardChildren(8))
  ]),

  'reign-timeline': node('Хронология правления', 'reign-timeline', '[data-module-id="reign-timeline"]', [
    node('Предыдущий правитель', 'timeline-previous', '[data-element-id="timeline-previous"]'),
    node('Заголовок', 'timeline-title', '[data-element-id="timeline-title"]'),
    node('Ось времени', 'timeline-axis', '[data-element-id="timeline-axis"]'),
    node('События хронологии', 'timeline-event', '[data-element-id="timeline-event"]', [
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
