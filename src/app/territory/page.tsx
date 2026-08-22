import type { Metadata } from 'next';
import { HistoricalTerritoryGlobe } from './HistoricalTerritoryGlobe';

export const metadata: Metadata = {
  title: 'Исторический глобус России | Правители России',
  description: 'Интерактивная хронология территории России от ранней Руси до современности.'
};

export default function TerritoryPage() {
  return <HistoricalTerritoryGlobe initialYear={2026} />;
}
