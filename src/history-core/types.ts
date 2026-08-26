export type HistoricalDatePrecision = 'day' | 'month' | 'year' | 'range' | 'circa';
export type HistoricalCalendar = 'julian' | 'gregorian' | 'byzantine-era' | 'mixed' | 'unknown';

export type HistoricalDate = {
  /** Date exactly as it appears in the source/publication. */
  original: string;
  /** ISO-like normalized date/range. Do not populate beyond source-supported precision. */
  normalized?: string;
  normalizedEnd?: string;
  precision: HistoricalDatePrecision;
  calendar: HistoricalCalendar;
  note?: string;
};

export type HistorySourceTier =
  | 'A1-archival-original'
  | 'A2-official-document-publication'
  | 'A3-contemporary-official-map'
  | 'B1-russian-academic-interpretation'
  | 'C-bootstrap-only';

/** Search/discovery collection or repository. Canonical records never cite this alone. */
export type HistorySource = {
  id: string;
  title: string;
  institution: string;
  url: string;
  tier: HistorySourceTier;
  coverage?: string;
  notes?: string;
  canonicalUse: Array<'event' | 'legal-basis' | 'boundary-date' | 'boundary-geometry' | 'interpretation'>;
};

/** Concrete document, archival unit, official publication item or period map cited by a fact. */
export type HistoryDocument = {
  id: string;
  sourceCollectionId: string;
  title: string;
  institution: string;
  url: string;
  tier: Exclude<HistorySourceTier, 'C-bootstrap-only'>;
  documentType: 'archival-document' | 'law' | 'treaty' | 'charter' | 'chronicle' | 'official-map' | 'documentary-publication' | 'other';
  date?: HistoricalDate;
  authority?: string[];
  archiveCitation?: string;
  publicationCitation?: string;
  pagesOrFolios?: string;
  notes?: string;
};

export type HistoryEventKind =
  | 'accession'
  | 'death'
  | 'law'
  | 'treaty'
  | 'war'
  | 'battle'
  | 'annexation'
  | 'cession'
  | 'union'
  | 'secession'
  | 'administrative-change'
  | 'diplomacy'
  | 'reform'
  | 'revolt'
  | 'cultural'
  | 'economic'
  | 'other';

export type HistoryReviewStatus =
  | 'research-required'
  | 'source-located'
  | 'source-verified'
  | 'geometry-verified'
  | 'superseded';

export type HistoryEvent = {
  id: string;
  title: string;
  kind: HistoryEventKind;
  date: HistoricalDate;
  polityIds: string[];
  rulerIds?: string[];
  placeIds?: string[];
  summary?: string;
  /** Must point to concrete entries in documents.json, not collection-level sources. */
  evidenceDocumentIds: string[];
  territoryChangeIds?: string[];
  reviewStatus: HistoryReviewStatus;
  notes?: string;
};

export type TerritoryTrack =
  | 'russian-legal-border'
  | 'de-facto-control'
  | 'front-line'
  | 'internal-administrative'
  | 'claim';

export type TerritoryModel =
  | 'linear-border'
  | 'frontier-zone'
  | 'sphere-of-control'
  | 'tributary-zone'
  | 'mixed';

export type TerritoryOperation =
  | 'replace-state'
  | 'acquire'
  | 'cede'
  | 'separate'
  | 'unite'
  | 'demarcate'
  | 'recognize'
  | 'occupy'
  | 'withdraw'
  | 'status-change';

export type TerritoryGeometryEvidence = {
  method: 'document-map' | 'contemporary-official-map' | 'derived-from-boundary-text' | 'uncertain-zone' | 'not-yet-georeferenced';
  file?: string;
  evidenceDocumentIds: string[];
  derivationNote?: string;
  uncertaintyMeters?: number;
};

export type TerritoryChange = {
  id: string;
  eventId: string;
  polityId: string;
  effectiveDate: HistoricalDate;
  track: TerritoryTrack;
  territorialModel: TerritoryModel;
  operation: TerritoryOperation;
  evidenceDocumentIds: string[];
  geometry: TerritoryGeometryEvidence;
  resultSnapshotId?: string;
  reviewStatus: HistoryReviewStatus;
  notes?: string;
};

export type TerritorySnapshot = {
  id: string;
  polityId: string;
  /** Exact effective moment; monthly views resolve the latest snapshot/change at or before month end. */
  effectiveDate: HistoricalDate;
  track: TerritoryTrack;
  territorialModel: TerritoryModel;
  geometryFile: string;
  evidenceDocumentIds: string[];
  derivedFromChangeIds: string[];
  reviewStatus: Extract<HistoryReviewStatus, 'source-verified' | 'geometry-verified'>;
  confidence: 'low' | 'medium' | 'high';
  notes?: string;
};
