import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TerritoryCanvasClient } from './TerritoryCanvasClient';
import './territory-premium-v2.css';

export const metadata: Metadata = {
  title: 'Исторический глобус России | Правители России',
  description: 'Историческая карта России с 862 года: глобус, плоская карта и таймлайн. Границы включают предварительные реконструкции с указанием источников и степени неопределённости.'
};

function TerritorySuspenseFallback() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label="Загрузка исторической карты"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#071821',
        color: '#f4ead3',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 500 }}>
          Правители России
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.5 }}>Загрузка исторической карты…</p>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: '#c5b99b', maxWidth: 460 }}>
          Границы отдельных эпох показаны по предварительным реконструкциям и не являются точными государственными рубежами.
        </p>
      </div>
    </main>
  );
}

export default function TerritoryPage() {
  return (
    <Suspense fallback={<TerritorySuspenseFallback />}>
      <TerritoryCanvasClient />
    </Suspense>
  );
}
