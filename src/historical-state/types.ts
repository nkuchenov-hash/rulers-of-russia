export type CssTokenName =
  | '--page-bg'
  | '--surface-primary'
  | '--surface-elevated'
  | '--text-primary'
  | '--text-muted'
  | '--accent-primary'
  | '--accent-secondary'
  | '--border-emphasis'
  | '--map-land'
  | '--map-water'
  | '--display-font'
  | '--display-tracking'
  | '--surface-radius'
  | '--shadow-character'
  | '--texture-opacity';

export type HistoricalTokenSet = Partial<Record<CssTokenName, string>>;

export type HistoricalLayerKind =
  | 'polity'
  | 'period'
  | 'reign'
  | 'rupture'
  | 'context';

export interface HistoricalVisualLayer {
  id: string;
  kind: HistoricalLayerKind;
  label: string;
  intensity: number;
  tokens: HistoricalTokenSet;
  compositionAccent?: 'calm' | 'axial' | 'asymmetric' | 'fractured' | 'monumental';
  imageTreatment?: string;
  mapTreatment?: string;
}

export interface HistoricalVisualStateSpec {
  layerIds: string[];
}

export interface ResolvedHistoricalVisualState {
  layers: HistoricalVisualLayer[];
  tokens: HistoricalTokenSet;
  compositionAccent?: HistoricalVisualLayer['compositionAccent'];
  imageTreatment?: string;
  mapTreatment?: string;
}
