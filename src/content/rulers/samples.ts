import type { RulerRecord } from './types';

export const sampleRulers: RulerRecord[] = [
  {
    slug: 'catherine-ii',
    canonicalName: 'Екатерина II',
    shortName: 'Екатерина II',
    reign: { start: '1762', end: '1796' },
    polity: 'Российская империя',
    visualState: { layerIds: ['polity:empire', 'period:late-18c', 'reign:catherine-ii'] },
    modules: [
      { id: 'ruler-hero', enabled: true },
      { id: 'reign-snapshot', enabled: true },
      { id: 'territory-map', enabled: true },
      { id: 'key-events', enabled: true },
      { id: 'legacy', enabled: true },
      { id: 'succession', enabled: true }
    ]
  },
  {
    slug: 'paul-i',
    canonicalName: 'Павел I',
    shortName: 'Павел I',
    reign: { start: '1796', end: '1801' },
    polity: 'Российская империя',
    visualState: { layerIds: ['polity:empire', 'period:late-18c', 'reign:paul-i'] },
    modules: [
      { id: 'ruler-hero', enabled: true },
      { id: 'reign-snapshot', enabled: true },
      { id: 'key-events', enabled: true },
      { id: 'succession', enabled: true }
    ]
  },
  {
    slug: 'alexander-i',
    canonicalName: 'Александр I',
    shortName: 'Александр I',
    reign: { start: '1801', end: '1825' },
    polity: 'Российская империя',
    visualState: { layerIds: ['polity:empire', 'period:alexandrian-empire', 'reign:alexander-i'] },
    modules: [
      { id: 'ruler-hero', enabled: true },
      { id: 'territory-map', enabled: true },
      { id: 'wars', enabled: true },
      { id: 'legacy', enabled: true },
      { id: 'succession', enabled: true }
    ]
  },
  {
    slug: 'lenin',
    canonicalName: 'Владимир Ленин',
    shortName: 'Ленин',
    reign: { start: '1917', end: '1924' },
    polity: 'Советская Россия / СССР',
    visualState: { layerIds: ['rupture:1917', 'period:early-soviet', 'reign:lenin'] },
    modules: [{ id: 'ruler-hero', enabled: true }, { id: 'key-events', enabled: true }, { id: 'legacy', enabled: true }]
  },
  {
    slug: 'stalin',
    canonicalName: 'Иосиф Сталин',
    shortName: 'Сталин',
    reign: { start: '1920s', end: '1953' },
    polity: 'СССР',
    visualState: { layerIds: ['period:stalin', 'reign:stalin'] },
    modules: [{ id: 'ruler-hero', enabled: true }, { id: 'territory-map', enabled: true }, { id: 'key-events', enabled: true }, { id: 'legacy', enabled: true }]
  }
];
