export type CoreModuleId =
  | 'background'
  | 'header'
  | 'historical-rail'
  | 'hero'
  | 'key-events'
  | 'page-tabs'
  | 'territory'
  | 'map'
  | 'facts'
  | 'thematic-card'
  | 'reign-timeline';

export interface CoreModulePassport {
  id: CoreModuleId;
  label: string;
  position: string;
  anatomy: string[];
  tools: string[];
  data: string[];
  sources: string[];
  interactions: string[];
  responsive: string[];
  hvs: string[];
}

export const coreModulePassports: Record<CoreModuleId, CoreModulePassport> = {
  background: {
    id: 'background',
    label: 'BackgroundModule',
    position: 'Viewport layer behind the centered site surface.',
    anatomy: ['AmbientBase', 'EraTextureLayer', 'Light/VignetteLayer', 'OptionalContextArtwork', 'ContentSurfaceShadow'],
    tools: ['CSS custom properties', 'HVS token resolver', 'Media Registry adapter', 'Responsive focal-point rules'],
    data: ['historicalVisualState ambient tokens', 'optional backgroundArtworkId', 'optional focalPoint', 'texture intensity'],
    sources: ['Historical Visual State Resolver', 'Media Registry when artwork is present'],
    interactions: ['Normally non-interactive', 'Selectable only in Core Inspector mode'],
    responsive: ['Always fills viewport', 'Artwork crop/focal point may change', 'Never scales the content surface down'],
    hvs: ['May change palette, texture, ambient artwork, light and material', 'Must preserve content contrast']
  },
  header: {
    id: 'header',
    label: 'TopHeader',
    position: 'Top of the site surface; persistent global navigation.',
    anatomy: ['BrandZone', 'PrimaryNavigation', 'SearchTrigger', 'Theme/HVS utility', 'MenuTrigger'],
    tools: ['CSS Grid', 'Sticky positioning', 'Navigation registry', 'Keyboard focus states'],
    data: ['site.navigation.items[]', 'site.navigation.activeItem', 'site.utilities'],
    sources: ['Site Configuration Registry'],
    interactions: ['Navigate', 'Search', 'Open menu', 'Theme/HVS utility in skeleton mode'],
    responsive: ['Desktop single row', 'Tablet condensed utilities', 'Mobile compact header/menu'],
    hvs: ['Structure fixed', 'Material, contrast and accents may change']
  },
  'historical-rail': {
    id: 'historical-rail',
    label: 'HistoricalRail',
    position: 'Left side of ruler page; persistent historical context.',
    anatomy: ['RailControls', 'ChronologyAxis', 'ContextWindow', 'AuthorityItem[]', 'ActiveAuthorityItem', 'ScrollControls'],
    tools: ['Virtualized list window', 'Chronology Graph adapter', 'Sticky container', 'Active-node resolver'],
    data: ['chronology.contextWindow[]', 'chronology.activeAuthorityId', 'portraitId', 'reign start/end', 'group label'],
    sources: ['Chronology Graph', 'Authority Registry', 'Media Registry'],
    interactions: ['Scroll context window', 'Select authority', 'Jump to adjacent historical node'],
    responsive: ['Desktop vertical rail', 'Tablet narrower rail', 'Mobile becomes drawer/horizontal history control'],
    hvs: ['Axis geometry fixed', 'Portrait treatment, materials and accent may change']
  },
  hero: {
    id: 'hero',
    label: 'HeroPanel',
    position: 'First main-content block; dominant visual entry into the reign.',
    anatomy: ['PeriodLine', 'CanonicalName', 'EditorialSummary', 'MetadataStrip', 'HeroArtwork', 'HeroActions', 'KeyEventsCard slot'],
    tools: ['Editorial typography scale', 'Media renderer', 'Responsive crop controller', 'Metadata cell primitive', 'ActionIconButton'],
    data: ['identity.canonicalName', 'identity.lifeDates / reign.period', 'editorial.shortDescription', 'hero.metaItems[]', 'media.heroAssetId'],
    sources: ['Authority Registry', 'Editorial Layer', 'Media Registry', 'Chronology Graph'],
    interactions: ['Save', 'Share', 'Fullscreen artwork', 'Key-event navigation'],
    responsive: ['Desktop split copy/art', 'Tablet balanced split', 'Mobile stacked hero with protected title size'],
    hvs: ['Highest sensitivity', 'Artwork, typography treatment, material and composition accent may change; information order remains fixed']
  },
  'key-events': {
    id: 'key-events',
    label: 'HeroKeyEventsCard',
    position: 'Overlay inside Hero artwork zone.',
    anatomy: ['Heading', 'KeyEventRow[]', 'SeeAllAction'],
    tools: ['Event list primitive', 'Overlay surface', 'Scroll/jump adapter'],
    data: ['hero.keyEventIds[] → Event Registry'],
    sources: ['Event Registry', 'Editorial ranking'],
    interactions: ['Open event', 'Jump to all events'],
    responsive: ['Desktop overlay', 'Mobile moves below hero copy/art'],
    hvs: ['Surface treatment may change; row structure remains fixed']
  },
  'page-tabs': {
    id: 'page-tabs',
    label: 'PageTabs',
    position: 'Directly below Hero; local navigation across current ruler page.',
    anatomy: ['TabList', 'ActiveIndicator', 'ScrollTargetBinding'],
    tools: ['Sticky nav', 'IntersectionObserver', 'Smooth scroll', 'Horizontal overflow on small screens'],
    data: ['page.sections[]', 'activeSectionId'],
    sources: ['Module Composition Resolver'],
    interactions: ['Scroll to module', 'Update active tab from viewport'],
    responsive: ['Single row on desktop', 'Horizontal scroll on mobile'],
    hvs: ['Geometry fixed', 'Accent and typography treatment may change']
  },
  territory: {
    id: 'territory',
    label: 'TerritoryPanel',
    position: 'Left column of the primary content row.',
    anatomy: ['SectionTitle', 'Summary', 'LegendItem[]', 'MapEraAction'],
    tools: ['Legend primitive', 'Semantic color tokens', 'Map-state adapter'],
    data: ['territory.summary', 'territory.legend[]', 'map.stateIds[]'],
    sources: ['Historical Map Dataset', 'Editorial Layer'],
    interactions: ['Toggle/identify legend state', 'Open full era map'],
    responsive: ['Desktop side panel', 'Mobile precedes map as explanatory block'],
    hvs: ['Legend semantics fixed; map colors/material adapt through HVS']
  },
  map: {
    id: 'map',
    label: 'HistoricalMapPanel',
    position: 'Center and largest column of the primary content row.',
    anatomy: ['MapCanvas', 'BoundaryLayer[]', 'ChangeLayer[]', 'PlaceLabelLayer', 'EventMarkerLayer', 'MapControls'],
    tools: ['SVG renderer initially', 'Layer manager', 'Viewport controller', 'Zoom controls', 'Tooltip/Popover', 'HistoricalMapState adapter'],
    data: ['boundarySetId', 'changeSetIds[]', 'locationIds[]', 'eventIds[]', 'viewport'],
    sources: ['Historical Map Dataset', 'Boundary Change Registry', 'Gazetteer', 'Event Registry', 'Source Registry'],
    interactions: ['Zoom', 'Pan', 'Layer toggle', 'Select territory/place/event', 'Synchronize with reign timeline'],
    responsive: ['Desktop interactive map', 'Mobile constrained aspect ratio with simplified labels'],
    hvs: ['Map treatment may vary strongly by era; controls and semantic layer meanings remain stable']
  },
  facts: {
    id: 'facts',
    label: 'FactsPanel',
    position: 'Right column of the primary content row.',
    anatomy: ['SectionTitle', 'FactRow[]', 'AllFactsAction'],
    tools: ['FactRow primitive', 'Icon slot', 'Structured-value formatter', 'Priority sorter'],
    data: ['facts.items[] {icon,label,value,priority,sourceIds[]}'],
    sources: ['Authority Registry', 'Polity Registry', 'Fact Resolver', 'Source Registry'],
    interactions: ['Open complete facts sheet', 'Source disclosure later'],
    responsive: ['Desktop side panel', 'Tablet/mobile becomes full-width list'],
    hvs: ['Very low sensitivity; only material, icon treatment and accent change']
  },
  'thematic-card': {
    id: 'thematic-card',
    label: 'ThematicCard',
    position: 'Secondary thematic row below Territory / Map / Facts.',
    anatomy: ['Title', 'OptionalDateRange', 'Summary', 'VariantContent', 'OptionalMedia', 'CTA'],
    tools: ['Variant renderer', 'List primitive', 'Media slot', 'Diagram slot', 'Editorial summary formatter'],
    data: ['thematicModules[] {type,title,dateRange,summary,items[],mediaId?,diagramId?,cta}'],
    sources: ['Module Composition Resolver', 'Event Registry', 'Editorial Layer', 'Media Registry', 'Relationship Registry'],
    interactions: ['Open thematic detail', 'Open related event/person/media'],
    responsive: ['Four-column desktop row', 'Two-column tablet', 'One-column mobile'],
    hvs: ['Card material and media treatment may change; variant contract stays stable']
  },
  'reign-timeline': {
    id: 'reign-timeline',
    label: 'ReignTimeline',
    position: 'Bottom of ruler page, below thematic modules.',
    anatomy: ['SectionTitle', 'PreviousAuthorityCard', 'TimeAxis', 'TimelineEvent[]', 'NextAuthorityCard'],
    tools: ['Scaled time-axis renderer', 'Event marker primitive', 'Chronology Graph adapter', 'Map synchronization hook'],
    data: ['reign.start/end', 'keyEventIds[]', 'previousAuthorityId', 'nextAuthorityId'],
    sources: ['Chronology Graph', 'Event Registry', 'Authority Registry'],
    interactions: ['Select event', 'Synchronize map/state', 'Navigate previous/next authority'],
    responsive: ['Desktop horizontal axis', 'Mobile horizontally scrollable axis or compact event list'],
    hvs: ['Axis logic fixed; markers, type and material may change']
  }
};
