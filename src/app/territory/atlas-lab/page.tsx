import type { Metadata } from 'next';
import { AtlasLabClient } from './AtlasLabClient';

export const metadata: Metadata = {
  title: 'Atlas Lab | Правители России',
  description: 'Экспериментальная полноэкранная оболочка исторического глобуса без изменения рабочего рендера.'
};

export default function AtlasLabPage() {
  return <AtlasLabClient />;
}
