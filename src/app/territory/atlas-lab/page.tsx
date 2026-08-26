import type { Metadata } from 'next';
import { AtlasLabCinematicClient } from './AtlasLabCinematicClient';

export const metadata: Metadata = {
  title: 'Atlas Lab | Правители России',
  description: 'Экспериментальная полноэкранная оболочка исторического глобуса без изменения рабочего рендера.'
};

export default function AtlasLabPage() {
  return <AtlasLabCinematicClient />;
}
