// Reuse the MVT transport that the shard preflight actually reached first.
// Keep the other endpoint as a fallback for resources with different health.
// This changes request order only: z=0 geometry, validation and tolerances
// remain identical. A JSON-only preflight preserves the canonical default.
export function orderMvtTransports(candidates, preferred) {
  const wanted = preferred === 'component-mvt' ? 'component-feature-layer-mvt'
    : preferred === 'resource-mvt' ? 'canonical-resource-mvt' : null;
  if (!wanted) return candidates;
  return [
    ...candidates.filter(candidate => candidate.kind === wanted),
    ...candidates.filter(candidate => candidate.kind !== wanted),
  ];
}
