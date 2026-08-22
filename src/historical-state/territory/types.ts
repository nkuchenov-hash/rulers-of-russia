import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type TerritoryReviewStatus =
  | 'source-captured-unreviewed'
  | 'needs-research'
  | 'verified'
  | 'superseded';

export type TerritoryConfidence = 'unreviewed' | 'low' | 'medium' | 'high';

export type TerritoryLegalBasis = {
  id: string;
  title: string;
  date?: string;
  url?: string;
  note?: string;
};

export type TerritoryProvenance = {
  capture_source?: string;
  capture_id?: string | number | null;
  capture_date?: string;
};

export type TerritorySnapshotProperties = {
  polity_id: string;
  name: string;
  start_date: string | number | null;
  end_date: string | number | null;
  status: 'provisional-source-capture' | 'verified';
  confidence: TerritoryConfidence;
  legal_basis: TerritoryLegalBasis[];
  source_ids: string[];
  provenance?: TerritoryProvenance;
  notes?: string;
};

export type TerritorySnapshotFeature = Feature<Geometry, TerritorySnapshotProperties>;
export type TerritorySnapshotCollection = FeatureCollection<Geometry, TerritorySnapshotProperties>;

export type TerritoryArchiveEntry = {
  polity_id: string;
  label: string;
  file: string | null;
  features: number;
  status: TerritoryReviewStatus;
  modern_override_required?: boolean;
};

export type TerritoryArchiveManifest = {
  schema_version: number;
  dataset: string;
  runtime_owner: 'project';
  runtime_external_dependencies: string[];
  policy: {
    modern_territory: string;
    historical_review: string;
    capture_sources_are_not_authoritative: boolean;
  };
  polities: TerritoryArchiveEntry[];
};
