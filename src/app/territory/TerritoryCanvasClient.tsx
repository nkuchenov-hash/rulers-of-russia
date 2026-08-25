'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV9').then((m) => m.HistoricalTerritoryGlobeWebGLV9),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
