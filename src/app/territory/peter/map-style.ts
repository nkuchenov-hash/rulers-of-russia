import type { StyleSpecification } from 'maplibre-gl';

export const LOCAL_GLOBE_STYLE: StyleSpecification = {
  version: 8,
  name: 'Rulers of Russia · Historical Globe Base',
  sources: {},
  layers: [
    {
      id: 'ocean',
      type: 'background',
      paint: {
        'background-color': '#071a22'
      }
    }
  ]
};
