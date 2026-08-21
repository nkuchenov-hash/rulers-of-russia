import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import { LabStudioSwitch } from '@/components/core-system/LabStudioSwitch';
import { peterILabRulerPageData } from '@/content/rulers/peterILabRulerPageData';

export const metadata = {
  title: 'Пётр I — Правители России',
  description: 'Живая тестовая страница сайта на данных Петра I.'
};

export default function LabPage() {
  return (
    <>
      <CoreDesignSystemSkeleton data={peterILabRulerPageData} />
      <LabStudioSwitch mode="lab" />
    </>
  );
}
