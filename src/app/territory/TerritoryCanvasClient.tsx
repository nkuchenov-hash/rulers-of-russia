'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV8').then((m) => m.HistoricalTerritoryGlobeWebGLV8),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
