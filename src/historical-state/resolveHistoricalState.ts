import type { CSSProperties } from 'react';
import { historicalLayers } from './presets';
import type {
  HistoricalTokenSet,
  HistoricalVisualStateSpec,
  ResolvedHistoricalVisualState
} from './types';

export function resolveHistoricalState(
  spec: HistoricalVisualStateSpec
): ResolvedHistoricalVisualState {
  const layers = spec.layerIds.map((id) => {
    const layer = historicalLayers.find((candidate) => candidate.id === id);
    if (!layer) throw new Error(`Unknown historical visual layer: ${id}`);
    return layer;
  });

  const tokens = layers.reduce<HistoricalTokenSet>(
    (resolved, layer) => ({ ...resolved, ...layer.tokens }),
    {}
  );

  const lastWithComposition = [...layers].reverse().find((layer) => layer.compositionAccent);
  const lastWithImage = [...layers].reverse().find((layer) => layer.imageTreatment);
  const lastWithMap = [...layers].reverse().find((layer) => layer.mapTreatment);

  return {
    layers,
    tokens,
    compositionAccent: lastWithComposition?.compositionAccent,
    imageTreatment: lastWithImage?.imageTreatment,
    mapTreatment: lastWithMap?.mapTreatment
  };
}

export function toCssVariables(tokens: HistoricalTokenSet) {
  return tokens as CSSProperties;
}
