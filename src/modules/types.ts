export type ModuleId =
  | 'ruler-hero'
  | 'reign-snapshot'
  | 'historical-context'
  | 'territory-map'
  | 'key-events'
  | 'reforms'
  | 'foreign-policy'
  | 'wars'
  | 'state-institutions'
  | 'society'
  | 'economy'
  | 'culture'
  | 'personal-dimension'
  | 'documents-quotes'
  | 'gallery'
  | 'historiography'
  | 'legacy'
  | 'succession';

export interface RulerModuleSpec {
  id: ModuleId;
  enabled: boolean;
  variant?: string;
  dataRef?: string;
}

export interface ModuleDefinition {
  id: ModuleId;
  purpose: string;
  status: 'provisional' | 'approved';
}
