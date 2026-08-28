export type RulerPageStructureRevision = 2;

export interface RulerRailItem {
  id: string;
  name: string;
  years: string;
  active?: boolean;
  portraitLabel?: string;
}

export interface RulerMetaItem {
  id: string;
  label: string;
  value: string;
}

export interface RulerKeyEvent {
  id: string;
  year: string;
  title: string;
}

export interface RulerQuote {
  id: string;
  text: string;
  context?: string;
  sourceLabel?: string;
}

export interface RulerPageTab {
  id: string;
  label: string;
  enabled: boolean;
}

export interface TerritoryLegendItem {
  id: string;
  label: string;
  type: 'base' | 'gain' | 'end' | 'dependent';
}

export interface RulerMapPlace {
  id: string;
  label: string;
  x: number;
  y: number;
  kind?: 'capital' | 'city' | 'region' | 'campaign';
}

export interface RulerMapData {
  ariaLabel: string;
  primaryLabel: string;
  changeLabel: string;
  places: RulerMapPlace[];
}

export interface RulerFact {
  id: string;
  label: string;
  value: string;
}

export interface ThematicDiagramData {
  centerLabel: string;
  nodes: string[];
}

export interface ThematicCardData {
  id: string;
  type: 'list' | 'image' | 'diagram' | 'mixed';
  title: string;
  dateLabel?: string;
  summary?: string;
  items?: Array<{ year?: string; title: string }>;
  mediaLabel?: string;
  diagram?: ThematicDiagramData;
  actionLabel: string;
}

export interface RulerTimelineEvent {
  id: string;
  date: string;
  title: string;
}

export interface RulerSourceRef {
  id: string;
  title: string;
  url: string;
  supports: string[];
}

export interface RulerPageData {
  structureRevision: RulerPageStructureRevision;
  id: string;
  slug: string;
  visualStateKey: 'core' | 'medieval' | 'imperial' | 'soviet' | 'contemporary';
  rail: RulerRailItem[];
  hero: {
    datesLabel: string;
    displayName: string;
    summary: string;
    imageAssetId: string | null;
    imageFallbackLabel?: string;
    meta: RulerMetaItem[];
    keyEvents: RulerKeyEvent[];
    quotes?: RulerQuote[];
  };
  tabs: RulerPageTab[];
  territory: {
    summary: string;
    legend: TerritoryLegendItem[];
  };
  map: RulerMapData;
  facts: RulerFact[];
  thematic: ThematicCardData[];
  timeline: {
    title: string;
    previous: { name: string } | null;
    next: { name: string } | null;
    events: RulerTimelineEvent[];
  };
  sources: RulerSourceRef[];
}
