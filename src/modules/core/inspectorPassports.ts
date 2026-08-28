import {
  corePassports as baseCorePassports,
  type CoreInspectableId as BaseCoreInspectableId,
  type CoreModuleId,
  type CorePassport
} from './modulePassports';
import { heroImageProductionFlow } from '@/modules/hero/heroVisualContract';

export type { CoreModuleId };
export type CoreInspectableId = BaseCoreInspectableId | 'hero-gradient' | 'rail-active-item';
export type ExtendedCorePassport = Omit<CorePassport, 'id'> & { id: CoreInspectableId };

const activeRailPassport: ExtendedCorePassport = {
  id: 'rail-active-item',
  kind: 'element',
  parent: 'Левая историческая шкала',
  label: 'Текущий правитель',
  what: 'Отдельная активная карточка текущего правителя. Это самостоятельное состояние и самостоятельный настраиваемый элемент, а не обычная карточка списка с косметическим классом active.',
  where: 'Внутри Historical Rail на вертикальной оси; всегда обозначает правителя, чья страница сейчас открыта.',
  structure: ['Увеличенный портрет', 'Имя', 'Годы правления', 'Активный маркер на оси', 'Отдельные ширина и высота карточки'],
  tools: ['AuthorityItem active variant', 'Chronology activeAuthorityId', 'Inspector size controls', 'Historical Visual State'],
  data: ['chronology.activeAuthorityId', 'authority.shortName', 'authority.reign.*', 'authority.railPortraitAssetId'],
  sources: ['Chronology Graph', 'Authority Registry', 'Media Registry'],
  flow: ['Chronology определяет activeAuthorityId.', 'Rail находит соответствующий узел.', 'Для него рендерится отдельный active variant.', 'Размер active-карточки берётся из настроек компонента, а не из объёма контента.'],
  interactions: ['Клик по карточке открывает/подтверждает текущего правителя.', 'В Studio карточка выбирается отдельно от обычных соседних карточек.'],
  fallback: ['Без портрета остаются имя, даты и активный маркер.', 'Контент не имеет права менять заданные размеры карточки.'],
  responsive: ['Desktop: отдельная заметная карточка внутри rail.', 'Mobile: превращается в активный элемент горизонтального контекстного списка/drawer.'],
  hvs: ['Эпоха может менять материал, акцент и обработку портрета.', 'Геометрия active-карточки остаётся настройкой компонента.']
};

const heroPassport: ExtendedCorePassport = {
  id: 'hero',
  kind: 'module',
  label: 'Hero-блок',
  what: 'Главная вводная сцена страницы правителя. Это один общий canvas, а не две отдельные колонки «текст + картинка».',
  where: 'Сразу под глобальной шапкой, в начале основной страницы правителя.',
  structure: ['Цельная Hero-картинка на весь блок', 'Полупрозрачный градиент между картинкой и контентом', 'Даты', 'Имя', 'Короткое описание', 'Метаданные', 'Сменяемая цитата правителя', 'Служебные действия'],
  tools: ['Full-bleed media layer', 'HeroGradientPanel', 'Safe text zone', 'RulerQuoteRotator', 'Media Registry', 'Historical Visual State', 'Responsive crop'],
  data: ['hero.imageAssetId', 'hero.gradient.*', 'identity.*', 'reign.*', 'editorial.shortDescription', 'hero.quotes[]'],
  sources: ['Реестр правителей', 'Медиатека', 'Реестр источников / цитат', 'Историческое визуальное состояние'],
  flow: ['Сначала выбирается только одобренная цельная Hero-картинка.', 'Картинка занимает весь Hero.', 'Поверх неё система строит градиент по настройкам Hero.', 'Текст помещается в безопасную для чтения зону.', 'Справа поверх изображения показывается одна подтверждённая цитата; цитаты автоматически сменяют друг друга.'],
  interactions: ['Пользователь читает основную информацию и может вручную переключать цитаты.', 'В режиме паспортов каждый внутренний элемент выбирается отдельно.'],
  fallback: ['Если одобренной Hero-картинки нет, используется нейтральная системная поверхность; случайный draft не показывается.', 'Если цитат нет, renderer может использовать прежний событийный fallback.'],
  responsive: ['На desktop картинка всегда full-bleed.', 'На mobile картинка остаётся единым фоном; градиент меняет направление и защищает текст сверху.', 'Цитата сохраняет отдельную безопасную карточку и крупный читаемый кегль.'],
  hvs: ['Эпоха может менять характер картинки, тон градиента, его плотность и мягкость.', 'Эпоха не может отменить читаемость, safe zone и правило единой Hero-картинки.']
};

const heroImagePassport: ExtendedCorePassport = {
  id: 'hero-image',
  kind: 'element',
  parent: 'Hero-блок',
  label: 'Цельная Hero-картинка',
  what: 'Одна готовая художественная композиция с правителем и его эпохой. Это не отдельный фон и не вырезанный портрет поверх другого слоя.',
  where: 'Заполняет 100% ширины и 100% высоты Hero-блока под всеми остальными слоями.',
  structure: ['Один файл изображения', 'Focal point для кропа', 'Alt-текст', 'Статус проверки', 'Связь с конкретным правителем'],
  tools: ['Media Library', 'Media Registry', 'object-fit: cover', 'Focal point / responsive crop', 'Режим проверки прямо на странице'],
  data: ['hero.imageAssetId', 'MediaAsset.filePath', 'MediaAsset.reviewStatus', 'MediaAsset.focalPoint', 'MediaAsset.alt'],
  sources: ['Отдельный файл в Медиатеке', 'Реестр медиа', 'Редакторский процесс одобрения'],
  flow: [...heroImageProductionFlow],
  interactions: ['Редактор смотрит кандидат прямо в настоящем Hero.', 'Редактор одобряет, отклоняет или просит новую версию.', 'Публичный пользователь не видит draft/review/rejected варианты.'],
  fallback: ['Нет approved asset — нет случайной или автоматически подставленной картинки.', 'Система показывает нейтральный фон Hero до появления одобренного изображения.'],
  responsive: ['Всегда cover на весь Hero.', 'Кроп меняется по focal point, но правитель и ключевая композиция не должны выпадать из кадра.'],
  hvs: ['Для каждого правителя изображение уже само отражает период.', 'HVS может задавать правила обработки/контраста, но не разрезает картинку на отдельные фон и портрет.']
};

const heroGradientPassport: ExtendedCorePassport = {
  id: 'hero-gradient',
  kind: 'element',
  parent: 'Hero-блок',
  label: 'Градиент Hero',
  what: 'Полупрозрачный интерфейсный слой между цельной Hero-картинкой и текстовым контентом. Он нужен для читаемости и красивого перехода, а не является частью файла изображения.',
  where: 'Поверх Hero-картинки и под текстом. На desktop начинается от текстовой стороны и мягко растворяется в изображении.',
  structure: ['Направление', 'Ширина', 'Набор точек прозрачности', 'Тон', 'Blur', 'Мягкость края'],
  tools: ['CSS linear-gradient', 'color-mix', 'backdrop-filter', 'Hero gradient settings', 'Historical Visual State'],
  data: ['hero.gradient.enabled', 'hero.gradient.direction', 'hero.gradient.widthPercent', 'hero.gradient.stops[]', 'hero.gradient.blurPx', 'hero.gradient.tintToken', 'hero.gradient.edgeSoftnessPercent'],
  sources: ['Настройки Hero в дизайн-системе', 'Историческое визуальное состояние правителя'],
  flow: ['Система получает настройки градиента.', 'Строит градиент программно — отдельный файл картинки для него не создаётся.', 'Градиент накрывает только необходимую часть Hero.', 'После этого поверх него размещается текст.', 'На mobile направление и площадь градиента меняются автоматически.'],
  interactions: ['На публичной странице сам по себе не кликается.', 'В режиме паспортов его можно выбрать отдельно и увидеть все правила и параметры.'],
  fallback: ['Если настройки повреждены, используется безопасный стандартный градиент.', 'Если градиент отключён, проверка контраста текста всё равно обязательна.'],
  responsive: ['Desktop: обычно 50–60% ширины, слева направо.', 'Mobile: превращается в вертикальную защиту текста и может занимать большую часть верхней зоны.'],
  hvs: ['Эпоха может менять tint, opacity, blur и характер перехода.', 'Нельзя ухудшать контраст текста или закрывать важную часть лица/композиции.']
};

const quoteModulePassport: ExtendedCorePassport = {
  id: 'key-events',
  kind: 'module',
  label: 'Цитаты правителя',
  what: 'Компактный Hero-модуль, который показывает одну подтверждённую цитату правителя и автоматически сменяет её следующей.',
  where: 'Поверх Hero-картинки справа, на месте прежнего списка ключевых событий.',
  structure: ['Метка модуля', 'Крупный текст цитаты', 'Контекст', 'Источник', 'Индикатор позиции', 'Ручное переключение'],
  tools: ['RulerQuoteRotator', 'setInterval', 'Studio speed control', 'Accessible manual navigation'],
  data: ['hero.quotes[]', 'quote.text', 'quote.context', 'quote.sourceLabel', 'Studio quoteRotationSeconds'],
  sources: ['Проверенные первичные/вторичные источники цитат', 'Source Registry'],
  flow: ['Renderer получает только проверенные цитаты.', 'Показывается одна цитата.', 'Через заданный интервал выбирается следующая.', 'Наведение временно останавливает смену.', 'Стрелки и точки позволяют переключать вручную.'],
  interactions: ['Читать цитату', 'Перейти к предыдущей/следующей', 'Выбрать конкретную цитату по индикатору', 'В Studio настроить скорость смены.'],
  fallback: ['Одна цитата показывается статично.', 'Если цитат нет, остаётся прежний событийный fallback, пока конкретная страница не заполнена цитатами.'],
  responsive: ['Desktop: компактная карточка поверх Hero.', 'Mobile: отдельная широкая карточка с крупным текстом и touch-контролами.'],
  hvs: ['Материал и контраст карточки могут меняться по эпохе.', 'Скорость и логика смены от эпохи не зависят.']
};

const quoteRowPassport: ExtendedCorePassport = {
  id: 'key-event-row',
  kind: 'element',
  parent: 'Цитаты правителя',
  label: 'Текущая цитата',
  what: 'Одна цитата правителя с кратким контекстом и указанием источника.',
  where: 'Основная содержательная зона модуля цитат.',
  structure: ['Текст цитаты', 'Контекст', 'Источник'],
  tools: ['Typography', 'Source reference', 'Transition animation'],
  data: ['hero.quotes[i].text', 'hero.quotes[i].context', 'hero.quotes[i].sourceLabel'],
  sources: ['Source Registry'],
  flow: ['Rotator выбирает текущий индекс.', 'Цитата появляется с коротким мягким переходом.', 'После интервала индекс меняется.'],
  interactions: ['Клик в Studio выбирает цитату для инспекции.'],
  fallback: ['Пустые цитаты отфильтровываются.', 'Без контекста остаётся только подтверждённый текст.'],
  responsive: ['Размер текста уменьшается только в допустимом диапазоне, без мелкого кегля.'],
  hvs: ['Можно менять контраст и гарнитуру, но не содержание цитаты.']
};

export const corePassports: Record<CoreInspectableId, ExtendedCorePassport> = {
  ...(baseCorePassports as unknown as Record<BaseCoreInspectableId, ExtendedCorePassport>),
  'rail-active-item': activeRailPassport,
  hero: heroPassport,
  'hero-image': heroImagePassport,
  'hero-gradient': heroGradientPassport,
  'key-events': quoteModulePassport,
  'key-event-row': quoteRowPassport
};
