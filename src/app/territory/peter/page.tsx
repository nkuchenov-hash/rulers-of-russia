import type { Metadata } from 'next';
import { PeterTerritoryMap } from './PeterTerritoryMap';

export const metadata: Metadata = {
  title: 'Петровская эпоха — границы по годам | Правители России',
  description: 'Интерактивная историческая карта границ России в 1682–1725 годах.'
};

export default function PeterTerritoryPage() {
  return <PeterTerritoryMap />;
}
