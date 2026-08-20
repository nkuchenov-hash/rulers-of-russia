import type { HistoricalVisualLayer } from './types';

// Values are intentionally provisional. Architecture is stable; final art direction is not.
export const historicalLayers: HistoricalVisualLayer[] = [
  {
    id: 'polity:empire',
    kind: 'polity',
    label: 'Российская империя',
    intensity: 0.45,
    tokens: {
      '--page-bg': '#181613',
      '--surface-primary': '#24211d',
      '--text-primary': '#f1ede4',
      '--accent-primary': '#aa9363',
      '--border-emphasis': 'rgba(170,147,99,.28)'
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
      '--surface-radius': '10px',
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
      '--page-bg': '#151514',
      '--accent-primary': '#8f7457',
      '--surface-radius': '6px'
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
      '--page-bg': '#171817',
      '--accent-primary': '#a89b7b',
      '--map-land': '#a6a087'
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
      '--surface-primary': '#222321',
      '--display-tracking': '-0.025em'
    }
  },
  {
    id: 'rupture:1917',
    kind: 'rupture',
    label: '1917 — распад линейной власти',
    intensity: 1,
    tokens: {
      '--page-bg': '#171513',
      '--surface-primary': '#23201d',
      '--accent-primary': '#a43d32',
      '--surface-radius': '2px',
      '--texture-opacity': '.18'
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
      '--page-bg': '#171716',
      '--accent-primary': '#b53c32',
      '--surface-radius': '4px'
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
      '--surface-primary': '#22211f',
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
      '--page-bg': '#151514',
      '--surface-primary': '#242321',
      '--accent-primary': '#9d3730',
      '--surface-radius': '3px',
      '--shadow-character': '0 20px 60px rgba(0,0,0,.28)'
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
      '--map-land': '#9b6b61'
    },
    compositionAccent: 'monumental'
  },
  {
    id: 'period:contemporary',
    kind: 'period',
    label: 'Новое время',
    intensity: 0.75,
    tokens: {
      '--page-bg': '#121416',
      '--surface-primary': '#1c2023',
      '--accent-primary': '#879aa4',
      '--surface-radius': '14px',
      '--texture-opacity': '0'
    },
    compositionAccent: 'calm',
    imageTreatment: 'clean-documentary',
    mapTreatment: 'modern-atlas'
  }
];
