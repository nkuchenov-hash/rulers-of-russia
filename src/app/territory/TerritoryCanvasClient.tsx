'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV7').then((m) => m.HistoricalTerritoryGlobeWebGLV7),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
