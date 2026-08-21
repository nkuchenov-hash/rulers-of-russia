import type { MediaAsset, MediaAssetId } from './types';

export interface HeroImageReference {
  imageAssetId?: MediaAssetId;
}

export const heroImageRules = {
  allowedKind: 'hero-image' as const,
  publicReviewStatus: 'approved' as const,
  publicRightsStatus: 'cleared' as const,
  requiredFields: ['filePath', 'alt', 'focalPoint', 'sourceIds'] as const
};

export function canRenderHeroImage(asset: MediaAsset | undefined): asset is MediaAsset {
  if (!asset) return false;
  if (asset.kind !== heroImageRules.allowedKind) return false;
  if (asset.reviewStatus !== heroImageRules.publicReviewStatus) return false;
  if (asset.rightsStatus !== heroImageRules.publicRightsStatus) return false;
  if (!asset.filePath || !asset.alt || !asset.focalPoint) return false;
  return true;
}

export function resolveHeroImage(
  reference: HeroImageReference,
  assets: ReadonlyMap<MediaAssetId, MediaAsset>
) {
  if (!reference.imageAssetId) return null;
  const asset = assets.get(reference.imageAssetId);
  return canRenderHeroImage(asset) ? asset : null;
}

export const heroImageProductionFlow = [
  'Сначала редактор или ChatGPT формирует визуальный бриф: правитель, период, окружение, настроение, композиция и свободные зоны под интерфейс.',
  'ChatGPT или художник создаёт одну законченную Hero-картинку целиком: правитель уже находится внутри исторической среды. Фон и фигура не собираются на странице из двух независимых слоёв.',
  'Изображение сохраняется отдельным файлом в Media Library. В код страницы картинка напрямую не вставляется.',
  'Media Registry создаёт запись для файла со статусом review, источниками, правами, focal point и safe text zone.',
  'Редакторская версия страницы показывает этот файл внутри настоящего Hero — с реальным кропом, заголовком, метаданными и карточкой ключевых событий.',
  'Человек нажимает «Одобрить» или «Отклонить». При отклонении сохраняется причина, а новая генерация становится новой версией/asset.',
  'Только asset со статусами approved и rights cleared может быть записан в hero.imageAssetId публичной страницы.',
  'Публичный Hero resolver повторно проверяет статус. Draft, review и rejected пользователю не показываются.'
] as const;
