import type { HistoricalVisualLayer } from './types';

// Provisional visual states. The layering architecture is stable; art direction values will evolve.
export const historicalLayers: HistoricalVisualLayer[] = [
  {
    id: 'period:medieval-rus',
    kind: 'period',
    label: 'Древняя Русь / средневековый слой',
    intensity: 0.72,
    tokens: {
      '--page-bg': '#ddc9a2',
      '--surface-primary': '#ddc9a2',
      '--surface-elevated': '#ead7ae',
      '--text-primary': '#2c2418',
      '--text-muted': '#6e5d43',
      '--accent-primary': '#9e3e2d',
      '--accent-secondary': '#b58a4d',
      '--border-emphasis': 'rgba(90,67,37,.32)',
      '--map-land': '#9f533b',
      '--map-water': '#cbbd9d',
      '--texture-opacity': '.16',
      '--ambient-base': '#8f7857',
      '--ambient-light': '#c8b187',
      '--ambient-deep': '#594632',
      '--ambient-texture-opacity': '.12'
    },
    compositionAccent: 'calm',
    imageTreatment: 'manuscript-painting-depth',
    mapTreatment: 'manuscript-atlas'
  },
  {
    id: 'polity:empire',
    kind: 'polity',
    label: 'Российская империя',
    intensity: 0.45,
    tokens: {
      '--page-bg': '#dfc9a5',
      '--surface-primary': '#dfc9a5',
      '--surface-elevated': '#ecd7b3',
      '--text-primary': '#2b2519',
      '--text-muted': '#715f43',
      '--accent-primary': '#b55e32',
      '--accent-secondary': '#d1aa61',
      '--border-emphasis': 'rgba(110,83,45,.30)',
      '--map-land': '#ae6840',
      '--map-water': '#b9aa8b',
      '--ambient-base': '#8c7657',
      '--ambient-light': '#c9b28a',
      '--ambient-deep': '#253842',
      '--ambient-texture-opacity': '.07'
    },
    compositionAccent: 'calm',
    mapTreatment: 'engraved-atlas'
  },
  {
    id: 'period:late-18c',
    kind: 'period',
    label: 'Поздний XVIII век',
    intensity: 0.55,
    tokens: {
      '--display-tracking': '-0.015em',
      '--surface-radius': '0px',
      '--texture-opacity': '.08'
    },
    imageTreatment: 'soft-painting-depth'
  },
  {
    id: 'reign:catherine-ii',
    kind: 'reign',
    label: 'Екатерина II',
    intensity: 0.65,
    tokens: {
      '--accent-secondary': '#7e6852',
      '--map-land': '#b29b70'
    },
    compositionAccent: 'calm'
  },
  {
    id: 'reign:paul-i',
    kind: 'reign',
    label: 'Павел I',
    intensity: 0.75,
    tokens: {
      '--page-bg': '#cdbb9d',
      '--accent-primary': '#8f7457',
      '--surface-radius': '0px'
    },
    compositionAccent: 'axial',
    imageTreatment: 'controlled-severe'
  },
  {
    id: 'period:alexandrian-empire',
    kind: 'period',
    label: 'Александровская эпоха',
    intensity: 0.7,
    tokens: {
      '--page-bg': '#d8c8aa',
      '--accent-primary': '#9b805d',
      '--map-land': '#a69070'
    },
    compositionAccent: 'axial',
    imageTreatment: 'neoclassical-air'
  },
  {
    id: 'reign:alexander-i',
    kind: 'reign',
    label: 'Александр I',
    intensity: 0.65,
    tokens: {
      '--surface-primary': '#ddd0b6',
      '--display-tracking': '-0.025em'
    }
  },
  {
    id: 'rupture:1917',
    kind: 'rupture',
    label: '1917 — распад линейной власти',
    intensity: 1,
    tokens: {
      '--page-bg': '#d2c4ae',
      '--surface-primary': '#d2c4ae',
      '--surface-elevated': '#dfd2bd',
      '--text-primary': '#24201b',
      '--accent-primary': '#a43d32',
      '--surface-radius': '0px',
      '--texture-opacity': '.18',
      '--ambient-base': '#74685a',
      '--ambient-light': '#b9aa94',
      '--ambient-deep': '#2c2824'
    },
    compositionAccent: 'fractured',
    imageTreatment: 'print-documentary',
    mapTreatment: 'unstable-authority'
  },
  {
    id: 'period:early-soviet',
    kind: 'period',
    label: 'Раннесоветский период',
    intensity: 0.8,
    tokens: {
      '--page-bg': '#d6ccb9',
      '--surface-primary': '#d6ccb9',
      '--surface-elevated': '#e2d7c2',
      '--text-primary': '#24221d',
      '--accent-primary': '#b53c32',
      '--surface-radius': '0px',
      '--ambient-base': '#756c5e',
      '--ambient-light': '#bdb09b',
      '--ambient-deep': '#172426'
    },
    compositionAccent: 'asymmetric',
    imageTreatment: 'graphic-documentary'
  },
  {
    id: 'reign:lenin',
    kind: 'reign',
    label: 'Ленин',
    intensity: 0.9,
    tokens: {
      '--display-tracking': '-0.035em'
    },
    compositionAccent: 'asymmetric'
  },
  {
    id: 'period:stalin',
    kind: 'period',
    label: 'Сталинский период',
    intensity: 0.95,
    tokens: {
      '--page-bg': '#d6ccb9',
      '--surface-primary': '#d6ccb9',
      '--surface-elevated': '#e3d8c5',
      '--text-primary': '#24221d',
      '--text-muted': '#6c6459',
      '--accent-primary': '#c53625',
      '--accent-secondary': '#c9a78a',
      '--border-emphasis': 'rgba(74,58,44,.30)',
      '--map-land': '#c14936',
      '--surface-radius': '0px',
      '--shadow-character': '0 20px 60px rgba(0,0,0,.22)',
      '--ambient-base': '#6f695d',
      '--ambient-light': '#bcb19d',
      '--ambient-deep': '#152326',
      '--ambient-texture-opacity': '.09'
    },
    compositionAccent: 'monumental',
    imageTreatment: 'monumental-documentary'
  },
  {
    id: 'reign:stalin',
    kind: 'reign',
    label: 'Сталин',
    intensity: 0.85,
    tokens: {
      '--display-tracking': '-0.01em',
      '--map-land': '#b44b38'
    },
    compositionAccent: 'monumental'
  },
  {
    id: 'period:contemporary',
    kind: 'period',
    label: 'Новое время',
    intensity: 0.75,
    tokens: {
      '--page-bg': '#e7e2d9',
      '--surface-primary': '#e7e2d9',
      '--surface-elevated': '#efebe4',
      '--text-primary': '#262b2d',
      '--text-muted': '#657077',
      '--accent-primary': '#8f4438',
      '--accent-secondary': '#91a3ab',
      '--border-emphasis': 'rgba(72,84,90,.28)',
      '--map-land': '#708894',
      '--map-water': '#cbd2d4',
      '--surface-radius': '0px',
      '--texture-opacity': '0',
      '--ambient-base': '#839097',
      '--ambient-light': '#c7cdd0',
      '--ambient-deep': '#263942',
      '--ambient-texture-opacity': '.015'
    },
    compositionAccent: 'calm',
    imageTreatment: 'clean-documentary',
    mapTreatment: 'modern-atlas'
  }
];
