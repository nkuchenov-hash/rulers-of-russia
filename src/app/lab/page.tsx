import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import { labRulerPageData } from '@/content/rulers/labRulerPageData';

export const metadata = {
  title: 'Test Lab — Правители России',
  description: 'Живая тестовая страница Core Design System, data contracts, HVS и Inspector.'
};

export default function LabPage() {
  return <CoreDesignSystemSkeleton data={labRulerPageData} labMode />;
}
