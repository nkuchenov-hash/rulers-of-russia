import type {
  HistoricalDate,
  HistorySource,
  TerritorySnapshot,
  TerritoryTrack,
} from './types';

const PRIMARY_TIERS = new Set<HistorySource['tier']>([
  'A1-archival-original',
  'A2-official-document-publication',
  'A3-contemporary-official-map',
]);

export function isPrimaryHistorySource(source: HistorySource): boolean {
  return PRIMARY_TIERS.has(source.tier);
}

export function hasCanonicalPrimaryEvidence(sourceIds: string[], sources: HistorySource[]): boolean {
  const wanted = new Set(sourceIds);
  return sources.some(source => wanted.has(source.id) && isPrimaryHistorySource(source));
}

/**
 * Returns YYYY-MM only when the source-backed date is precise enough for a monthly timeline.
 * Year-only / circa / unresolved range dates intentionally return null: we do not invent a month.
 */
export function monthKeyFromHistoricalDate(date: HistoricalDate): string | null {
  if (!date.normalized) return null;
  if (date.precision !== 'day' && date.precision !== 'month') return null;
  const match = date.normalized.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function normalizedSortKey(date: HistoricalDate): string | null {
  if (!date.normalized) return null;
  if (date.precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(date.normalized)) return date.normalized;
  if (date.precision === 'month' && /^\d{4}-\d{2}$/.test(date.normalized)) return `${date.normalized}-01`;
  return null;
}

/**
 * Resolve a production boundary at month-end. Only geometry-verified snapshots with month/day
 * precision are eligible. Uncertain year-only dating is excluded instead of being guessed.
 */
export function resolveTerritorySnapshotAtMonth(
  snapshots: TerritorySnapshot[],
  month: string,
  polityId: string,
  track: TerritoryTrack = 'russian-legal-border',
): TerritorySnapshot | null {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`Invalid history month: ${month}`);
  const monthEnd = `${month}-31`;

  let best: TerritorySnapshot | null = null;
  let bestKey = '';

  for (const snapshot of snapshots) {
    if (snapshot.polityId !== polityId || snapshot.track !== track) continue;
    if (snapshot.reviewStatus !== 'geometry-verified') continue;
    const key = normalizedSortKey(snapshot.effectiveDate);
    if (!key || key > monthEnd || key < bestKey) continue;
    best = snapshot;
    bestKey = key;
  }

  return best;
}

export function snapshotsNeedingDateResearch(snapshots: TerritorySnapshot[]): TerritorySnapshot[] {
  return snapshots.filter(snapshot => normalizedSortKey(snapshot.effectiveDate) === null);
}
