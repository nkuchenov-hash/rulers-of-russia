import assert from 'node:assert/strict';
import {resolveTerritorySnapshotAtMonth} from '../src/history-core/resolve.ts';

const base = {
  id: 'source-bounded-reconstruction',
  polityId: 'test-polity',
  track: 'russian-legal-border',
  territorialModel: 'linear-border',
  effectiveDate: {original: '1900-01', normalized: '1900-01', precision: 'month', calendar: 'gregorian'},
  validThroughMonth: '1900-06',
  geometryFile: 'test.geojson',
  evidenceDocumentIds: [],
  derivedFromChangeIds: [],
  reviewStatus: 'geometry-verified',
  confidence: 'low',
};
assert.equal(resolveTerritorySnapshotAtMonth([base], '1900-06', 'test-polity')?.id, base.id);
assert.equal(resolveTerritorySnapshotAtMonth([base], '1900-07', 'test-polity'), null);
assert.equal(resolveTerritorySnapshotAtMonth([base], '1899-12', 'test-polity'), null);
assert.equal(resolveTerritorySnapshotAtMonth([{...base, validThroughMonth: null}], '1900-07', 'test-polity')?.id, base.id);
const older = {...base, id: 'older-border', effectiveDate: {...base.effectiveDate, original: '1890-01', normalized: '1890-01'}, validThroughMonth: null};
assert.equal(resolveTerritorySnapshotAtMonth([older, base], '1900-07', 'test-polity'), null, 'An expired newer border must not resurrect an obsolete older border');
assert.equal(resolveTerritorySnapshotAtMonth([older, base], '1900-06', 'test-polity')?.id, base.id);
console.log('Verified source validity horizons and obsolete-border fallback respected.');
