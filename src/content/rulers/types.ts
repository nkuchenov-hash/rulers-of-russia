import type { HistoricalVisualStateSpec } from '@/historical-state/types';
import type { RulerModuleSpec } from '@/modules/types';
import type { MediaAssetId } from '@/content/media/types';

export interface RulerRecord {
  slug: string;
  canonicalName: string;
  shortName: string;
  reign: { start: string; end: string };
  polity: string;
  visualState: HistoricalVisualStateSpec;
  hero?: {
    /** Одна законченная Hero-картинка: правитель уже изображён внутри среды своей эпохи. */
    imageAssetId?: MediaAssetId;
  };
  modules: RulerModuleSpec[];
}
