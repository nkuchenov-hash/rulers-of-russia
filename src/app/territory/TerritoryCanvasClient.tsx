'use client';

import dynamic from 'next/dynamic';

const HistoricalTerritoryMap = dynamic(
  () => import('./HistoricalTerritoryMapLibreV13').then((module) => module.HistoricalTerritoryMapLibreV13),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryMap initialYear={2026}/>;
}
