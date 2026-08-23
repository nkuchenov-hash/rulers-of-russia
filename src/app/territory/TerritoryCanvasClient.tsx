'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobeCanvas = dynamic(
  () => import('./HistoricalTerritoryGlobeCanvasRuntime').then((m) => m.HistoricalTerritoryGlobeCanvasRuntime),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobeCanvas initialYear={2026} />;
}
