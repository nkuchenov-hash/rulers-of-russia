import {
  corePassports as baseCorePassports,
  type CoreInspectableId as BaseCoreInspectableId,
  type CoreModuleId,
  type CorePassport
} from './modulePassports';
import { heroImageProductionFlow } from '@/modules/hero/heroVisualContract';

export type { CoreModuleId };
export type CoreInspectableId = BaseCoreInspectableId | 'hero-gradient';
export type ExtendedCorePassport = Omit<CorePassport, 'id'> & { id: CoreInspectableId };

const heroPassport: ExtendedCorePassport = {
  id: 'hero',
  kind: 'module',
  label: 'Hero-блок',
  what: 'Главная вводная сцена страницы правителя. Это один общий canvas, а не две отдельные колонки «текст + картинка».',
  where: 'Сразу под глобальной шапкой, в начале основной страницы правителя.',
  structure: ['Цельная Hero-картинка на весь блок', 'Полупрозрачный градиент между картинкой и контентом', 'Даты', 'Имя', 'Короткое описание', 'Метаданные', 'Ключевые события', 'Служебные действия'],
  tools: ['Full-bleed media layer', 'HeroGradientPanel', 'Safe text zone', 'Media Registry', 'Historical Visual State', 'Responsive crop'],
  data: ['hero.imageAssetId', 'hero.gradient.*', 'identity.*', 'reign.*', 'editorial.shortDescription', 'hero.keyEventIds[]'],
  sources: ['Реестр правителей', 'Медиатека', 'Реестр событий', 'Историческое визуальное состояние'],
  flow: ['Сначала выбирается только одобренная цельная Hero-картинка.', 'Картинка занимает весь Hero.', 'Поверх неё система строит градиент по настройкам Hero.', 'Текст помещается в безопасную для чтения зону.', 'Карточка ключевых событий остаётся поверх изображения справа.'],
  interactions: ['Пользователь читает основную информацию, открывает ключевые события и служебные действия.', 'В режиме паспортов каждый внутренний элемент выбирается отдельно.'],
  fallback: ['Если одобренной Hero-картинки нет, используется нейтральная системная поверхность; случайный draft не показывается.', 'Если градиент выключен, система всё равно обязана проверить контраст текста.'],
  responsive: ['На desktop картинка всегда full-bleed.', 'На mobile картинка остаётся единым фоном; градиент меняет направление и защищает текст сверху.'],
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

export const corePassports: Record<CoreInspectableId, ExtendedCorePassport> = {
  ...(baseCorePassports as unknown as Record<BaseCoreInspectableId, ExtendedCorePassport>),
  hero: heroPassport,
  'hero-image': heroImagePassport,
  'hero-gradient': heroGradientPassport
};
