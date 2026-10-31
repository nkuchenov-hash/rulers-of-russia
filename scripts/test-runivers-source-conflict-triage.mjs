import assert from 'node:assert/strict';
import {summarizeRuniversSourceConflicts} from './summarize-runivers-source-conflicts.mjs';

const sample = (distanceMeters, selectedName, excludedName, sampledBoundary = 'runivers-reference') => ({
  sampledBoundary,
  distanceMeters,
  selectedSourceRecords: [{cat: 51, name: selectedName, geometry: {coordinates: [[10,20]]}}],
  excludedSourceRecords: [{cat: 488, name: excludedName, geometry: {coordinates: [[30,40]]}}],
  selectedSourceRecordsMatchedCount: 1,
  excludedSourceRecordsMatchedCount: 1,
  lonLat: [66.97265625, 67.57571742],
});
const report = {
  summary: {auditedRange: {startMonth:'1520-01',endMonth:'1599-12'}},
  failedComparisons: [
    {runiversResourceId:5383,historyFirstMonth:'1520-01',
      symmetricMaxMeters:983475,symmetricP95Meters:718014,
      referenceToCurrentMaxMeters:983475,currentToReferenceMaxMeters:700000,
      boundarySampleAttribution:[
        sample(500000, 'not the worst sample', 'not the worst excluded'),
        sample(983475, 'Московское княжество', 'Обдорское княжество'),
        sample(700000, 'Российское царство', 'Зона русской колонизации', 'history-core'),
      ],rawGeometry:{coordinates:[[1,2]]}},
    {runiversResourceId:5385,historyFirstMonth:'1520-01',
      symmetricMaxMeters:900000,symmetricP95Meters:700000,
      referenceToCurrentMaxMeters:900000,currentToReferenceMaxMeters:500000,
      boundarySampleAttribution:[sample(900000,'Московское княжество','Обдорское княжество')]},
    {runiversResourceId:5399,historyFirstMonth:'1553-01',
      symmetricMaxMeters:1111421,symmetricP95Meters:1054800,
      boundarySampleAttribution:[]},
  ],
  referenceFailures:[{reason:'outage',geometry:{coordinates:[[9,9]]}}],
  unmatchedReferenceLayers:[{runiversResourceId:5397},{runiversResourceId:5397},{runiversResourceId:5403}],
};
const result = summarizeRuniversSourceConflicts(report);
assert.equal(result.schemaVersion,1);
assert.equal(result.diagnosticOnly,true);
assert.match(result.acceptance,/NOT A GEOGRAPHIC PASS/);
assert.deepEqual(result.auditedRange,{startMonth:'1520-01',endMonth:'1599-12'});
assert.equal(result.failedComparisons,3);
assert.equal(result.unattributedComparisons,1);
assert.equal(result.referenceFailureCount,1);
assert.deepEqual(result.unmatchedReferenceResourceIds,[5397,5403]);
assert.equal(result.clusters.length,2);
const ob = result.clusters[0];
assert.equal(ob.comparisons,2);
assert.equal(ob.maxSymmetricErrorMeters,983475);
assert.equal(ob.maxSymmetricP95Meters,718014);
assert.equal(ob.selectedSourceIdentities,'51:Московское княжество');
assert.equal(ob.excludedSourceIdentities,'488:Обдорское княжество');
assert.equal(ob.coincidentSelectedExcludedAtWorstSample,true);
assert.deepEqual(ob.resourceIds,[5383,5385]);
assert.deepEqual(ob.historyStateStarts,['1520-01']);
assert.equal(result.clusters[1].selectedSourceIdentities,'unknown');
assert.equal(result.clusters[1].excludedSourceIdentities,'unknown');
// Both directed failures must be visible independently: a History Core
// overhang cannot be misdiagnosed as a Runivers reference-side boundary.
assert.deepEqual(result.unattributedByDirection, {'runivers-reference':1,'history-core':2});
assert.deepEqual(result.unmatchedReportedMaximumByDirection, {'runivers-reference':0,'history-core':0});
assert.equal(result.directionalHotspots.length,2);
const referenceSide = result.directionalHotspots.find(row => row.sampledBoundary === 'runivers-reference');
const historySide = result.directionalHotspots.find(row => row.sampledBoundary === 'history-core');
assert.equal(referenceSide.comparisons,2);
assert.equal(referenceSide.maxAttributedSampleDistanceMeters,983475);
assert.equal(referenceSide.maxReportedDirectionalMeters,983475);
assert.equal(referenceSide.reportedMaximumMatches,2);
assert.equal(referenceSide.reportedMaximumUnmatched,0);
assert.deepEqual(referenceSide.resourceIds,[5383,5385]);
assert.equal(historySide.comparisons,1);
assert.equal(historySide.maxAttributedSampleDistanceMeters,700000);
assert.equal(historySide.maxReportedDirectionalMeters,700000);
assert.equal(historySide.reportedMaximumMatches,1);
assert.equal(historySide.selectedSourceIdentities,'51:Российское царство');
assert.equal(historySide.excludedSourceIdentities,'488:Зона русской колонизации');
assert.deepEqual(historySide.resourceIds,[5383]);
assert.deepEqual(historySide.historyStateStarts,['1520-01']);
const serialized = JSON.stringify(result);
assert.ok(!serialized.includes('66.97265625') && !serialized.includes('67.57571742'),
  'licensed boundary sample positions must not be serialized');
assert.ok(!serialized.includes('coordinates') && !serialized.includes('not the worst sample'),
  'raw geometry and lower-severity source records must not be serialized');
assert.ok(!serialized.includes('lonLat') && !serialized.includes('rawGeometry'),
  'neither directional hotspot may publish coordinates or raw geometry');
assert.throws(()=>summarizeRuniversSourceConflicts({summary:{}}),/lacks failedComparisons/);
const malicious = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId:1,historyFirstMonth:'not-a-month',
  boundarySampleAttribution:[{
    sampledBoundary:'runivers-reference',distanceMeters:42,
    selectedSourceRecords:[{cat:{coordinates:[1,2]},name:'R'.repeat(1000)}],
    excludedSourceRecords:[],
  }],
}]});
assert.equal(malicious.clusters[0].selectedSourceIdentities,'?:'+'R'.repeat(120));
assert.deepEqual(malicious.clusters[0].historyStateStarts,[]);
assert.deepEqual(malicious.unmatchedReportedMaximumByDirection,
  {'runivers-reference':1,'history-core':0}, 'missing directed metric cannot be claimed as an attributed maximum');
assert.equal(malicious.directionalHotspots[0].maxReportedDirectionalMeters,null,
  'missing directed metric must not be reported as zero or a pass');
assert.ok(!JSON.stringify(malicious).includes('coordinates'),
  'nested source metadata must never escape into public artifacts');
// A source name attached to the worst *sampled* point is not proof that it
// explains the larger comparison-level maximum (or a missing metric).
const incompleteAttribution = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId:5401, historyFirstMonth:'1553-01',
  referenceToCurrentMaxMeters:1111421, currentToReferenceMaxMeters:200,
  boundarySampleAttribution:[
    sample(400000, 'Российское царство', 'Зона русской колонизации'),
    sample(200, 'Российское царство', 'Зона русской колонизации', 'history-core'),
  ],
}]});
assert.deepEqual(incompleteAttribution.unmatchedReportedMaximumByDirection,
  {'runivers-reference':1,'history-core':0});
const unmatched = incompleteAttribution.directionalHotspots.find(row => row.sampledBoundary === 'runivers-reference');
assert.equal(unmatched.maxAttributedSampleDistanceMeters,400000);
assert.equal(unmatched.maxReportedDirectionalMeters,1111421);
assert.equal(unmatched.reportedMaximumMatches,0);
assert.equal(unmatched.reportedMaximumUnmatched,1);
assert.equal(incompleteAttribution.directionalHotspots.find(row => row.sampledBoundary === 'history-core').reportedMaximumMatches,1);
assert.equal(incompleteAttribution.auditedRange.startMonth,null);
const invalidMonth = summarizeRuniversSourceConflicts({failedComparisons:[{
  historyFirstMonth:'1520-13', boundarySampleAttribution:[],
}]});
assert.deepEqual(invalidMonth.clusters[0].historyStateStarts,[],
  'invalid calendar month must never enter dated source triage');
// The same Runivers category/name can refer to distinct dated political
// acts. Combining them would erase the very transitions under investigation.
const datedReport = summarizeRuniversSourceConflicts({failedComparisons:[
  ...[
    ['1553-01-01', 6],
    ['1554-01-01', 6],
    ['1554-01-01', 7],
  ].map(([lwdate, status], i) => ({
    runiversResourceId: 5399 + i,
    historyFirstMonth: '1553-01',
    symmetricMaxMeters: 1111421 - i,
    referenceToCurrentMaxMeters: 1111421 - i,
    boundarySampleAttribution: [{
      ...sample(1111421 - i, 'Российское царство', 'Зона русской колонизации'),
      selectedSourceRecords: [{cat:767, name:'Российское царство', lwdate, status}],
      excludedSourceRecords: [{cat:522, name:'Зона русской колонизации'}],
    }],
  })),
]});
assert.equal(datedReport.clusters.length, 3,
  'distinct dated source records must not be collapsed into one conflict');
assert.equal(datedReport.directionalHotspots.length, 3,
  'both aggregate and directed source triage must preserve dated identities');
assert.deepEqual(datedReport.clusters.map(row => row.selectedSourceIdentities).sort(), [
  '767:Российское царство@1553-01-01#status=6',
  '767:Российское царство@1554-01-01#status=6',
  '767:Российское царство@1554-01-01#status=7',
]);
assert.ok(!JSON.stringify(datedReport).includes('coordinates'),
  'dated identity must remain scalar metadata without licensed geometry');
// The previous 500-character grouping-key truncation merged distinct source
// records whenever the first several identities were long and identical.
// Keep the public display bounded without losing dated evidence internally.
const longSharedRecords = Array.from({length: 7}, (_, i) => ({
  cat: 100 + i, name: 'X'.repeat(100), lwdate: '1553-01-01', status: 6,
}));
const collisionReport = summarizeRuniversSourceConflicts({failedComparisons:
  ['1554-01-01', '1555-01-01'].map((lastDate, i) => ({
    runiversResourceId: 5400 + i, historyFirstMonth: '1553-01',
    referenceToCurrentMaxMeters: 100 + i,
    boundarySampleAttribution: [{
      ...sample(100 + i, 'Russian state', 'colonization zone'),
      selectedSourceRecords: longSharedRecords.map((record, j) =>
        j === longSharedRecords.length - 1 ? {...record, lwdate: lastDate} : record),
    }],
  })),
});
assert.equal(collisionReport.clusters.length, 2,
  'source identities differing after the public 500-character prefix must remain distinct');
assert.equal(collisionReport.directionalHotspots.length, 2,
  'directed geographic triage must also preserve distinct long source identities');
assert.equal(collisionReport.clusters[0].selectedSourceIdentities.length, 500);
assert.equal(collisionReport.clusters[0].selectedSourceIdentities,
  collisionReport.clusters[1].selectedSourceIdentities,
  'public display remains deliberately bounded and may share a prefix');
assert.notEqual(collisionReport.clusters[0].selectedSourceIdentityFingerprint,
  collisionReport.clusters[1].selectedSourceIdentityFingerprint,
  'bounded display collisions must have distinguishable source fingerprints');
assert.ok(!JSON.stringify(collisionReport).includes('coordinates'),
  'fingerprints and bounded labels must not leak source geometry');


 // Preserve distinct original source features even when their visible polity,
 // category, effective date and status are identical. Numeric-string category
 // IDs must retain their provenance rather than turning into unknown '?'.
const distinctFeatures = summarizeRuniversSourceConflicts({failedComparisons:
  ['relation-101', 'relation-102'].map((featureId, i) => ({
    runiversResourceId: 5410 + i,
    historyFirstMonth: '1560-01',
    symmetricMaxMeters: 500000 + i,
    referenceToCurrentMaxMeters: 500000 + i,
    boundarySampleAttribution: [{
      ...sample(500000 + i, 'Российское царство', 'Зона русской колонизации'),
      selectedSourceRecords: [{featureId, cat: '767', name: 'Российское царство',
        lwdate: '1556-01-01', status: 6}],
      excludedSourceRecords: [],
    }],
  })),
});
assert.equal(distinctFeatures.clusters.length, 2,
  'different original feature IDs must never be merged into one source conflict');
assert.equal(distinctFeatures.directionalHotspots.length, 2,
  'directed triage must preserve distinct original feature IDs');
assert.deepEqual(distinctFeatures.clusters.map(row => row.selectedSourceIdentities).sort(), [
  '767:Российское царство#feature=relation-101@1556-01-01#status=6',
  '767:Российское царство#feature=relation-102@1556-01-01#status=6',
]);
assert.ok(!JSON.stringify(distinctFeatures).includes('coordinates'),
  'original feature IDs must not cause geometry disclosure');

// A failed comparison with absent distance measurements must remain unknown,
// not appear as a zero-metre geographic success in the triage summary.
const unknownDistance = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId: 5419, historyFirstMonth: '1590-01',
  boundarySampleAttribution: [],
}]});
assert.equal(unknownDistance.clusters[0].maxSymmetricErrorMeters, null);
assert.equal(unknownDistance.clusters[0].maxSymmetricP95Meters, null);
const measuredZero = summarizeRuniversSourceConflicts({failedComparisons:[{
  runiversResourceId: 5420, symmetricMaxMeters: 0, symmetricP95Meters: 0,
  boundarySampleAttribution: [],
}]});
assert.equal(measuredZero.clusters[0].maxSymmetricErrorMeters, 0,
  'a real measured zero must remain distinguishable from missing evidence');
assert.equal(measuredZero.clusters[0].maxSymmetricP95Meters, 0);

// Long scalar metadata used to be truncated *before* building grouping keys.
// Two original feature IDs or dated records with a common 120/160-character
// prefix therefore collapsed, even after fixing the 500-character display cap.
const longBase = {
  cat: 767,
  name: 'N'.repeat(120) + '-common',
  featureId: 'F'.repeat(160) + '-common',
  lwdate: 'D'.repeat(120) + '-common',
  status: 'S'.repeat(120) + '-common',
};
const longScalarCases = ['name', 'featureId', 'lwdate', 'status'];
const longScalarReport = summarizeRuniversSourceConflicts({failedComparisons:
  longScalarCases.flatMap((field, caseIndex) => ['-SECRET_A', '-SECRET_B'].map((suffix, variant) => ({
    runiversResourceId: 5500 + caseIndex * 2 + variant,
    historyFirstMonth: '1553-01',
    referenceToCurrentMaxMeters: 1000,
    boundarySampleAttribution: [{
      ...sample(1000, 'Russian state', 'colonization zone'),
      selectedSourceRecords: [{...longBase, [field]: longBase[field] + suffix}],
      excludedSourceRecords: [],
    }],
  }))),
});
assert.equal(longScalarReport.clusters.length, 8,
  'distinct original long source scalars must not merge at their display truncation');
assert.equal(longScalarReport.directionalHotspots.length, 8,
  'directional triage must retain long feature/date/status/name distinctions');
for (const field of longScalarCases) {
  const pair = longScalarReport.clusters.filter(row => row.resourceIds.some(id =>
    id >= 5500 + longScalarCases.indexOf(field) * 2 &&
    id < 5502 + longScalarCases.indexOf(field) * 2));
  assert.equal(pair.length, 2, field + ' identities must remain separate');
  assert.notEqual(pair[0].selectedSourceIdentityFingerprint,
    pair[1].selectedSourceIdentityFingerprint);
  assert.ok(pair.every(row => row.selectedSourceIdentities.includes('#sha256=')));
}
assert.ok(!JSON.stringify(longScalarReport).includes('SECRET_'),
  'unbounded source metadata must not be exposed in diagnostic artifacts');
assert.ok(!JSON.stringify(longScalarReport).includes('coordinates'),
  'long scalar fingerprints must not expose licensed geometry');

console.log('Runivers source-conflict triage tests passed: two-sided attribution, severity grouping, missing evidence, redaction, dated-source separation, no acceptance override.');
