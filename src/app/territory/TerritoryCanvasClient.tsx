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

type HistoricalTerritoryMapProps = {
  initialYear?: number;
  initialMonth?: number | null;
};

type RequestedDate = {
  year: number;
  month: number | null;
};

const HistoricalTerritoryMap = dynamic<HistoricalTerritoryMapProps>(
  () => import('./HistoricalTerritoryGlobeWebGLV21').then((module) => module.HistoricalTerritoryGlobeWebGLV21),
  {ssr:false},
);

function boundedInteger(value: string | null, min: number, max: number) {
  if (value === null || !/^-?\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function dateFromLocation(): RequestedDate {
  const params = new URLSearchParams(window.location.search);
  return {
    year: boundedInteger(params.get('year'), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR) ?? TERRITORY_MAX_YEAR,
    month: boundedInteger(params.get('month'), 1, 12),
  };
}

export function TerritoryCanvasClient() {
  const [requestedDate, setRequestedDate] = useState<RequestedDate | null>(null);

  useEffect(() => {
    const sync = () => setRequestedDate(dateFromLocation());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (!requestedDate) return null;
  const dateKey = `${requestedDate.year}-${requestedDate.month ?? 'auto'}`;

  return (
    <HistoricalTerritoryMap
      key={dateKey}
      initialYear={requestedDate.year}
      initialMonth={requestedDate.month}
    />
  );
}
