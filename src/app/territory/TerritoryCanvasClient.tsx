'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryMap = dynamic(
  () => import('./HistoricalTerritoryMapLibreV14').then((module) => module.HistoricalTerritoryMapLibreV14),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryMap initialYear={2026}/>;
}
