import fs from 'node:fs';

const file = 'public/data/history-core/territory-model.json';
const model = JSON.parse(fs.readFileSync(file, 'utf8'));
const baseId = 'base-kievan-rus-oleg-end-912';
const fragmentId = 'frag-kievan-rus-oleg-acquisitions-912-reconstruction';
const inheritedId = 'frag-early-rus-rurik-862-reconstruction';

if (!(model.fragments ?? []).some(item => item.id === inheritedId)) {
  throw new Error(`Missing inherited verified fragment ${inheritedId}`);
}

if (!(model.fragments ?? []).some(item => item.id === fragmentId)) {
  model.fragments.unshift({
    id: fragmentId,
    polityId: 'kievan-rus',
    track: 'de-facto-control',
    role: 'territory-area',
    territorialModel: 'frontier-zone',
    geometryFile: 'geometry/kievan-rus-oleg-acquisitions-912-reconstruction.geojson',
    evidenceDocumentIds: [
      'doc-pvl-laurentian-1926',
      'doc-tornau-rus-862-map-1910',
      'doc-gugk-rybakov-old-rus-1961'
    ],
    reviewStatus: 'geometry-verified',
    confidence: 'low',
    uncertaintyMeters: 150000,
    derivationNote: 'Geometry-verified transcription of the solid yellow Tornau 1910 inset layer «Олега +912». This fragment contains only the acquisition layer and is combined with the inherited verified Rurik core in the 912 Kievan Rus base state. The source is a secondary reconstruction with explicit 150 km uncertainty, not a surveyed medieval border.'
  });
}

if (!(model.baseStates ?? []).some(item => item.id === baseId)) {
  model.baseStates.push({
    id: baseId,
    polityId: 'kievan-rus',
    track: 'de-facto-control',
    territorialModel: 'frontier-zone',
    coverageAnchorMonth: '0912-12',
    historicalDate: {
      original: 'к 912 году',
      normalized: '0912',
      precision: 'year',
      calendar: 'source-specific-chronicle-chronology'
    },
    geometryFragmentIds: [inheritedId, fragmentId],
    evidenceDocumentIds: [
      'doc-pvl-laurentian-1926',
      'doc-tornau-rus-862-map-1910',
      'doc-gugk-rybakov-old-rus-1961'
    ],
    reviewStatus: 'geometry-verified',
    confidence: 'low',
    notes: 'Operational coverage begins at the final month of 912 rather than inventing an exact acquisition date. Tornau explicitly labels the cumulative acquisition layer «Олега +912» and the next durable acquisition layer «Святослава +972»; the bounded state therefore ends at 0971-12. Temporary Sviatoslav control is not included.',
    validThroughMonth: '0971-12'
  });
}

fs.writeFileSync(file, JSON.stringify(model, null, 2) + '\n');
console.log(`Applied ${baseId} / ${fragmentId} if absent.`);
