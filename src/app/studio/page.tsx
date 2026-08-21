import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import { assertGenericStudioData } from '@/content/rulers/assertGenericStudioData';
import { labRulerPageData } from '@/content/rulers/labRulerPageData';

export const metadata = {
  title: 'Редактор структуры — Правители России',
  description: 'Generic-редактор структуры страницы: слои слева, нейтральный renderer по центру, свойства справа.'
};

const studioData = assertGenericStudioData(labRulerPageData);

export default function StudioPage() {
  return <CoreDesignSystemSkeleton data={studioData} editorMode />;
}
