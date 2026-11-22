import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TerritoryCanvasClient } from './territory/TerritoryCanvasClient';
import './territory/territory-premium-v2.css';

export const metadata: Metadata = {
  title: 'Историческая карта России | Правители России',
  description: 'Интерактивная карта России с 862 года: исторические границы, глобус и хронология. Предварительные реконструкции обозначены отдельно.',
};

export default function HomePage() {
  return (
    <Suspense fallback={<main role="status" aria-live="polite" style={{minHeight:'100dvh',display:'grid',placeItems:'center',background:'#071821',color:'#f4ead3',padding:24}}><p>Загрузка исторической карты…</p></main>}>
      <TerritoryCanvasClient />
    </Suspense>
  );
}
