'use client';

import { useEffect, useState } from 'react';
import type { RulerPageData } from '@/content/rulers/pageModel';
import { CoreDesignSystemSkeleton } from '@/components/core-system/CoreDesignSystemSkeleton';
import {
  defaultInspectorTuning,
  STUDIO_TUNING_STORAGE_KEY,
  type InspectorTuning
} from '@/components/core-system/CoreInspectorDrawer';

function restoreStudioTuning(): void {
  try {
    const raw = window.localStorage.getItem(STUDIO_TUNING_STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw) as Partial<InspectorTuning>;
    const restored: InspectorTuning = {
      ...defaultInspectorTuning,
      ...saved,
      gradient: {
        ...defaultInspectorTuning.gradient,
        ...(saved.gradient ?? {})
      },
      thematicCardSizes: {
        ...defaultInspectorTuning.thematicCardSizes,
        ...(saved.thematicCardSizes ?? {})
      }
    };

    Object.assign(defaultInspectorTuning, restored);
  } catch {
    window.localStorage.removeItem(STUDIO_TUNING_STORAGE_KEY);
  }
}

export function PersistentStudioRenderer({ data }: { data: RulerPageData }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreStudioTuning();
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <>
      <CoreDesignSystemSkeleton data={data} editorMode />
      <button
        type="button"
        onClick={() => {
          window.localStorage.removeItem(STUDIO_TUNING_STORAGE_KEY);
          window.location.reload();
        }}
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 120,
          minHeight: 44,
          padding: '8px 14px',
          border: '1px solid #555',
          borderRadius: 6,
          background: '#1e1e1e',
          color: '#f2f2f2',
          fontSize: '16pt',
          cursor: 'pointer'
        }}
      >
        Сбросить настройки
      </button>
    </>
  );
}
