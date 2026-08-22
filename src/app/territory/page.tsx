import type { Metadata } from 'next';
import { HistoricalTerritoryGlobePremium } from './HistoricalTerritoryGlobePremium';
import './territory-premium-v2.css';

export const metadata: Metadata = {
  title: 'Исторический глобус России | Правители России',
  description: 'Интерактивная хронология территории России и исторических границ мира.'
};

export default function TerritoryPage() {
  return <HistoricalTerritoryGlobePremium initialYear={2026} />;
}
