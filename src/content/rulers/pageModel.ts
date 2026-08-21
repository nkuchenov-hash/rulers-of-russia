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

export interface RulerFact {
  id: string;
  label: string;
  value: string;
}

export interface ThematicCardData {
  id: string;
  type: 'list' | 'image' | 'diagram' | 'mixed';
  title: string;
  dateLabel?: string;
  summary?: string;
  items?: Array<{ year?: string; title: string }>;
  mediaLabel?: string;
  actionLabel: string;
}

export interface RulerTimelineEvent {
  id: string;
  date: string;
  title: string;
}

export interface RulerPageData {
  id: string;
  slug: string;
  visualStateKey: 'core' | 'medieval' | 'imperial' | 'soviet' | 'contemporary';
  rail: RulerRailItem[];
  hero: {
    datesLabel: string;
    displayName: string;
    summary: string;
    imageAssetId: string | null;
    meta: RulerMetaItem[];
    keyEvents: RulerKeyEvent[];
  };
  tabs: RulerPageTab[];
  territory: {
    summary: string;
    legend: TerritoryLegendItem[];
  };
  facts: RulerFact[];
  thematic: ThematicCardData[];
  timeline: {
    title: string;
    previous: { name: string } | null;
    next: { name: string } | null;
    events: RulerTimelineEvent[];
  };
}
