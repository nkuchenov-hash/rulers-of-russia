import type { HistoricalVisualStateSpec } from '@/historical-state/types';
import type { RulerModuleSpec } from '@/modules/types';

export interface RulerRecord {
  slug: string;
  canonicalName: string;
  shortName: string;
  reign: { start: string; end: string };
  polity: string;
  visualState: HistoricalVisualStateSpec;
  modules: RulerModuleSpec[];
}
