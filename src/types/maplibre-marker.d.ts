import 'maplibre-gl';

declare module 'maplibre-gl' {
  interface MarkerOptions {
    occludedOpacity?: number;
  }
}
