'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryMap = dynamic(
  () => import('./HistoricalTerritoryMapLibreV17').then((module) => module.HistoricalTerritoryMapLibreV17),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryMap initialYear={2026}/>;
}
