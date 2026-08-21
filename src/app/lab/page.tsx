import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import { peterILabRulerPageData } from '@/content/rulers/peterILabRulerPageData';

export const metadata = {
  title: 'Test Lab — Пётр I — Правители России',
  description: 'Живая тестовая страница Core Design System, data contracts, HVS и Inspector на данных Петра I.'
};

export default function LabPage() {
  return <CoreDesignSystemSkeleton data={peterILabRulerPageData} labMode />;
}
