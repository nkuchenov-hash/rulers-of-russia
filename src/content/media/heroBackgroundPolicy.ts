import type { MediaAsset, MediaAssetId } from './types';

export interface HeroBackgroundReference {
  backgroundAssetId?: MediaAssetId;
}

export const heroBackgroundRules = {
  allowedKind: 'hero-background' as const,
  publicReviewStatus: 'approved' as const,
  publicRightsStatus: 'cleared' as const,
  requiredFields: ['filePath', 'alt', 'focalPoint', 'sourceIds'] as const
};

export function canRenderHeroBackground(asset: MediaAsset | undefined): asset is MediaAsset {
  if (!asset) return false;
  if (asset.kind !== heroBackgroundRules.allowedKind) return false;
  if (asset.reviewStatus !== heroBackgroundRules.publicReviewStatus) return false;
  if (asset.rightsStatus !== heroBackgroundRules.publicRightsStatus) return false;
  if (!asset.filePath || !asset.alt || !asset.focalPoint) return false;
  return true;
}

export function resolveHeroBackground(
  reference: HeroBackgroundReference,
  assets: ReadonlyMap<MediaAssetId, MediaAsset>
) {
  if (!reference.backgroundAssetId) return null;
  const asset = assets.get(reference.backgroundAssetId);
  return canRenderHeroBackground(asset) ? asset : null;
}

export const heroBackgroundProductionFlow = [
  'Редактор или ChatGPT формирует визуальный бриф по эпохе, правителю и композиции Hero.',
  'Если фон генерируется ИИ, создаётся отдельный файл изображения. Он не встраивается напрямую в код страницы.',
  'Файл сохраняется в Media Library, а в Media Registry создаётся запись со статусом review.',
  'На редакторской версии страницы файл показывается в реальном Hero-кропе вместе с заголовком, портретом и карточкой событий.',
  'Человек принимает решение: approved или rejected. При отклонении сохраняется причина и создаётся новая версия файла.',
  'Только approved + rights cleared asset может быть записан в hero.backgroundAssetId для публичной страницы.',
  'Публичный Hero resolver дополнительно проверяет статус. Draft, review и rejected никогда не рендерятся пользователю.'
] as const;
