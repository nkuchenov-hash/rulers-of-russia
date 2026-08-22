import type { Metadata } from 'next';
import { HistoricalTerritoryGlobe } from '../HistoricalTerritoryGlobe';

export const metadata: Metadata = {
  title: 'Петровская эпоха — исторический глобус | Правители России',
  description: 'Интерактивная историческая карта территории России в Петровскую эпоху.'
};

export default function PeterTerritoryPage() {
  return <HistoricalTerritoryGlobe initialYear={1721} />;
}
