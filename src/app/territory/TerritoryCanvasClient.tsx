'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryMap = dynamic(
  () => import('./HistoricalTerritoryMapLibreV20').then((module) => module.HistoricalTerritoryMapLibreV20),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryMap initialYear={2026}/>;
}
