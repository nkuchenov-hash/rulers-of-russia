'use client';

import './histographyOrbitPatch';
import dynamic from 'next/dynamic';

const HistoricalTerritoryMap = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV21').then((module) => module.HistoricalTerritoryGlobeWebGLV21),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  return <HistoricalTerritoryMap initialYear={2026}/>;
}
