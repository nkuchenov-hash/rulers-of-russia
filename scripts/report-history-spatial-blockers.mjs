import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const model = JSON.parse(fs.readFileSync(path.join(dataRoot, 'territory-model.json'), 'utf8'));

const blockers = [];
for (const changeFile of model.changeFiles ?? []) {
  const filePath = path.join(dataRoot, changeFile);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const change of payload.territoryChanges ?? []) {
    const isGeometryMutation = change.geometryAction !== 'metadata-only';
    const geometryVerified = change.reviewStatus === 'geometry-verified';
    if (!isGeometryMutation || geometryVerified) continue;

    blockers.push({
      id: change.id,
      effectiveDate: change.effectiveDate?.normalized ?? null,
      precision: change.effectiveDate?.precision ?? null,
      polityId: change.polityId ?? null,
      track: change.track ?? null,
      operation: change.operation ?? null,
      territorialModel: change.territorialModel ?? null,
      reviewStatus: change.reviewStatus ?? null,
      geometryMethod: change.geometry?.method ?? null,
      evidenceDocumentIds: change.evidenceDocumentIds ?? [],
      sourceFile: changeFile,
    });
  }
}

blockers.sort((a, b) =>
  String(a.effectiveDate ?? '').localeCompare(String(b.effectiveDate ?? '')) ||
  String(a.id).localeCompare(String(b.id))
);

const byOperation = Object.fromEntries(
  [...new Set(blockers.map(x => x.operation ?? 'missing'))]
    .sort()
    .map(op => [op, blockers.filter(x => (x.operation ?? 'missing') === op).length])
);
const byTrack = Object.fromEntries(
  [...new Set(blockers.map(x => x.track ?? 'missing'))]
    .sort()
    .map(track => [track, blockers.filter(x => (x.track ?? 'missing') === track).length])
);

const report = {
  schema_version: 1,
  generatedAt: new Date().toISOString(),
  definition: 'Territory changes that can mutate production geometry and are not yet geometry-verified. metadata-only changes are intentionally excluded.',
  totalSpatialBlockers: blockers.length,
  byOperation,
  byTrack,
  blockers,
};

const outDir = path.join(dataRoot, 'generated');
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'spatial-blockers.json'), JSON.stringify(report, null, 2) + '\n');

console.log(`History spatial blockers: ${blockers.length}`);
for (const blocker of blockers) {
  console.log(`${blocker.effectiveDate ?? 'unknown'}\t${blocker.operation ?? 'missing'}\t${blocker.track ?? 'missing'}\t${blocker.id}\t${blocker.geometryMethod ?? 'missing'}`);
}
