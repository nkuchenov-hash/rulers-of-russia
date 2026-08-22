import type { Metadata } from 'next';
import { HistoricalTerritoryGlobeLocal } from './HistoricalTerritoryGlobeLocal';

export const metadata: Metadata = {
  title: 'Исторический глобус России | Правители России',
  description: 'Интерактивная хронология территории России и исторических границ мира.'
};

export default function TerritoryPage() {
  return <HistoricalTerritoryGlobeLocal initialYear={2026} />;
}
