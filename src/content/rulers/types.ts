import type { HistoricalVisualStateSpec } from '@/historical-state/types';
import type { RulerModuleSpec } from '@/modules/types';
import type { MediaAssetId } from '@/content/media/types';

export interface RulerHeroMedia {
  /** Отдельный одобренный фон Hero. Публичный renderer обязан проверить Media Registry. */
  backgroundAssetId?: MediaAssetId;
  /** Отдельный портрет/фигура правителя. Не склеивается с фоном в один исходный asset. */
  portraitAssetId?: MediaAssetId;
}

export interface RulerRecord {
  slug: string;
  canonicalName: string;
  shortName: string;
  reign: { start: string; end: string };
  polity: string;
  visualState: HistoricalVisualStateSpec;
  hero?: {
    media: RulerHeroMedia;
  };
  modules: RulerModuleSpec[];
}
