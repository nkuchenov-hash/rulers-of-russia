'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeCanvasRuntime').then((m) => m.HistoricalTerritoryGlobeCanvasRuntime),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
