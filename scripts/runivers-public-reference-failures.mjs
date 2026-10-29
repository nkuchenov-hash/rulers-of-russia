// Runivers reference exports and error messages are untrusted third-party
// data. Only allowlisted, non-geometric identifiers may enter public CI
// artifacts; never serialize the original layer object or exception message.
const STAGES = new Set([
  'reference-fetch', 'reference-geometry', 'polity-scope', 'border-comparison',
]);
const safeYear = value => Number.isInteger(value) && value >= 1 && value <= 9999
  ? value : null;

export function publicReferenceFailure(failure) {
  const layer = failure?.layer;
  return {
    runiversResourceId: Number.isSafeInteger(layer?.id) && layer.id > 0 ? layer.id : null,
    runiversFromYear: safeYear(layer?.fromYear),
    runiversToYear: safeYear(layer?.toYear),
    historyPolityId: typeof failure?.polityId === 'string'
      && /^[a-z0-9-]{1,64}$/.test(failure.polityId) ? failure.polityId : null,
    stage: STAGES.has(failure?.stage) ? failure.stage : 'unclassified',
  };
}
