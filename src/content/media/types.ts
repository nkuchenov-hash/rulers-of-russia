export type MediaAssetId = string;

export type MediaOrigin =
  | 'ai-generated'
  | 'archive'
  | 'museum'
  | 'editorial-composite';

export type MediaReviewStatus = 'draft' | 'review' | 'approved' | 'rejected';
export type MediaRightsStatus = 'unknown' | 'review' | 'cleared' | 'restricted';

export interface MediaFocalPoint {
  x: number;
  y: number;
}

export interface MediaSafeZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaAsset {
  id: MediaAssetId;
  kind: 'hero-image' | 'thematic-image' | 'document' | 'map-texture';
  filePath: string;
  origin: MediaOrigin;
  reviewStatus: MediaReviewStatus;
  rightsStatus: MediaRightsStatus;
  alt: string;
  sourceIds: string[];
  promptSpecPath?: string;
  generatedBy?: string;
  focalPoint?: MediaFocalPoint;
  safeTextZone?: MediaSafeZone;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
}
