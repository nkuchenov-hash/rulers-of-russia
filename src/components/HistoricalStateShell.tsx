import type { ReactNode } from 'react';
import { resolveHistoricalState, toCssVariables } from '@/historical-state/resolveHistoricalState';
import type { HistoricalVisualStateSpec } from '@/historical-state/types';

export function HistoricalStateShell({
  state,
  children
}: {
  state: HistoricalVisualStateSpec;
  children: ReactNode;
}) {
  const resolved = resolveHistoricalState(state);

  return (
    <div
      data-composition={resolved.compositionAccent}
      data-image-treatment={resolved.imageTreatment}
      data-map-treatment={resolved.mapTreatment}
      style={toCssVariables(resolved.tokens)}
    >
      {children}
    </div>
  );
}
