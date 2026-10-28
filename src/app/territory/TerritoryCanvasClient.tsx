'use client';

import './histographyOrbitPatch.js';
import './globeWeightAndCityTuning.js';
import './countryLabelGrounding.js';
import './cartographicBoundarySanitizer.js';
import './mapHistoricalAccuracyPatch.js';
import './territoryTimelineAtomicPatch.js';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR } from './territoryChronology';
import { parseTerritoryQueryDate, type ParsedTerritoryQueryDate } from './territoryQueryDate';

type HistoricalTerritoryMapProps = {
  initialYear?: number;
  initialMonth?: number | null;
};

const HistoricalTerritoryMap = dynamic<HistoricalTerritoryMapProps>(
  () => import('./HistoricalTerritoryGlobeWebGLV21').then((module) => module.HistoricalTerritoryGlobeWebGLV21),
  {ssr:false},
);

export function TerritoryCanvasClient() {
  const [requestedDate, setRequestedDate] = useState<ParsedTerritoryQueryDate | null>(null);

  useEffect(() => {
    const sync = () => setRequestedDate(parseTerritoryQueryDate(window.location.search, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (!requestedDate) return null;
  if (!requestedDate.valid) {
    return (
      <main role="alert" style={{minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#071821', color: '#f7ecd8'}}>
        <div style={{maxWidth: 560, fontSize: 18, lineHeight: 1.5}}>
          <h1 style={{fontSize: 26}}>Некорректная дата карты</h1>
          <p>{requestedDate.error}</p>
          <a href="./" style={{color: '#f0d48b'}}>Открыть карту без параметров</a>
        </div>
      </main>
    );
  }
  const dateKey = `${requestedDate.year}-${requestedDate.month ?? 'auto'}`;

  return (
    <HistoricalTerritoryMap
      key={dateKey}
      initialYear={requestedDate.year}
      initialMonth={requestedDate.month}
    />
  );
}
