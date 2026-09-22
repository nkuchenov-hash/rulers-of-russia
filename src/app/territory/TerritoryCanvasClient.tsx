'use client';

import './histographyOrbitPatch.js';
import './globeWeightAndCityTuning.js';
import './countryLabelGrounding.js';
import './cartographicBoundarySanitizer.js';
import './mapHistoricalAccuracyPatch.js';
import './territoryTimelineAtomicPatch.js';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR } from './territoryChronology';

type HistoricalTerritoryMapProps = {
  initialYear?: number;
  initialMonth?: number | null;
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

export function TerritoryCanvasClient() {
  const params = useSearchParams();
  const requestedYear = boundedInteger(params.get('year'), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR);
  const requestedMonth = boundedInteger(params.get('month'), 1, 12);
  const initialYear = requestedYear ?? TERRITORY_MAX_YEAR;
  const dateKey = `${initialYear}-${requestedMonth ?? 'auto'}`;

  return (
    <HistoricalTerritoryMap
      key={dateKey}
      initialYear={initialYear}
      initialMonth={requestedMonth}
    />
  );
}
