import type { Metadata } from 'next';
import { TerritoryCanvasClient } from './TerritoryCanvasClient';
import './territory-premium-v2.css';

export const metadata: Metadata = {
  title: 'Исторический глобус России | Правители России',
  description: 'Интерактивная хронология территории России и исторических границ мира.'
};

export default function TerritoryPage() {
  return <TerritoryCanvasClient />;
}
