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
  {ssr:false, loading: () => <TerritoryLoading />},
);

function TerritoryLoading() {
  return (
    <main role="status" aria-live="polite" aria-label="Загрузка исторической карты" style={{minHeight:'100dvh',display:'grid',placeItems:'center',padding:24,background:'radial-gradient(circle at 50% 42%, #17343a 0%, #071821 48%, #02090d 100%)',color:'#f4ead3',textAlign:'center'}}>
      <div style={{maxWidth:480}}>
        <div aria-hidden="true" style={{width:88,height:88,margin:'0 auto 28px',borderRadius:'50%',border:'1px solid #bba36b',boxShadow:'inset -16px -10px 25px #091b22, 0 0 45px #36504b',background:'radial-gradient(circle at 34% 32%, #53786d, #183840 65%, #071821)'}} />
        <h1 style={{fontFamily:'Georgia,serif',fontSize:'clamp(24px,5vw,36px)',fontWeight:500,margin:'0 0 12px'}}>Правители России</h1>
        <p style={{fontSize:16,lineHeight:1.5,color:'#d7cba9',margin:0}}>Подготавливаем историческую карту…</p>
      </div>
    </main>
  );
}

export function TerritoryCanvasClient() {
  const [requestedDate, setRequestedDate] = useState<ParsedTerritoryQueryDate | null>(null);

  useEffect(() => {
    const sync = () => setRequestedDate(parseTerritoryQueryDate(window.location.search, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  if (!requestedDate) return <TerritoryLoading />;
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
