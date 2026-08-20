export type AuthorityKind = 'ruler' | 'regency' | 'government' | 'collective' | 'claimant' | 'interregnum';

export interface AuthoritySpan {
  id: string;
  kind: AuthorityKind;
  start: string;
  end?: string;
  concurrentWith?: string[];
}
