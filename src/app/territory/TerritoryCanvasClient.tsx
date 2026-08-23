'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV3').then((m) => m.HistoricalTerritoryGlobeWebGLV3),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
