import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import { peterILabRulerPageData } from '@/content/rulers/peterILabRulerPageData';

export const metadata = {
  title: 'Редактор страницы — Правители России',
  description: 'Редактор той же страницы сайта: слои слева, живая страница по центру, свойства справа.'
};

export default function StudioPage() {
  return <CoreDesignSystemSkeleton data={peterILabRulerPageData} editorMode />;
}
