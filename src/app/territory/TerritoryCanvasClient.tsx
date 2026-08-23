'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryGlobeCanvas = dynamic(
  () => import('./HistoricalTerritoryGlobeCanvas').then((m) => m.HistoricalTerritoryGlobeCanvas),
  { ssr: false }
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryGlobeCanvas initialYear={2026} />;
}
