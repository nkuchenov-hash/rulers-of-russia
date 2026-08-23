'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobeCanvas = dynamic(
  () => import('./HistoricalTerritoryGlobeCanvasV2').then((m) => m.HistoricalTerritoryGlobeCanvasV2),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobeCanvas initialYear={2026} />;
}
