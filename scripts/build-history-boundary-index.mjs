import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const modelFile = path.join(dataRoot, 'territory-model.json');
const outputFile = path.join(dataRoot, 'generated', 'verified-boundaries.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

if (!fs.existsSync(modelFile)) throw new Error('Missing territory-model.json');
const model = readJson(modelFile);
const fragments = new Map((model.fragments ?? []).map(fragment => [fragment.id, fragment]));
const entries = [];

const preciseDate = date => {
  if (!date?.normalized) return null;
  if (date.precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(date.normalized)) return date.normalized;
  if (date.precision === 'month' && /^\d{4}-\d{2}$/.test(date.normalized)) return `${date.normalized}-01`;
  return null;
};

for (const relative of model.changeFiles ?? []) {
  const file = path.join(dataRoot, relative);
  if (!fs.existsSync(file)) throw new Error(`Missing change file ${relative}`);
  for (const change of readJson(file).territoryChanges ?? []) {
    if (change.reviewStatus !== 'geometry-verified') continue;
    const effectiveFrom = preciseDate(change.effectiveDate);
    if (!effectiveFrom) continue;
    for (const fragmentId of change.geometryFragmentIds ?? []) {
      const fragment = fragments.get(fragmentId);
      if (!fragment || fragment.reviewStatus !== 'geometry-verified') continue;
      if (!['boundary-corridor', 'frontier-zone', 'control-zone'].includes(fragment.role)) continue;
      const geometryFile = path.join(dataRoot, fragment.geometryFile);
      if (!fs.existsSync(geometryFile)) throw new Error(`Verified boundary fragment ${fragmentId} is missing ${fragment.geometryFile}`);
      entries.push({
        id: `${change.id}:${fragmentId}`,
        changeId: change.id,
        eventId: change.eventId,
        fragmentId,
        polityId: change.polityId,
        track: change.track,
        role: fragment.role,
        territorialModel: fragment.territorialModel,
        geometryFile: `data/history-core/${fragment.geometryFile}`,
        effectiveFrom,
        effectiveTo: fragment.effectiveTo ?? null,
        reviewStatus: 'geometry-verified',
        confidence: fragment.confidence,
        evidenceDocumentIds: [...new Set([...(fragment.evidenceDocumentIds ?? []), ...(change.evidenceDocumentIds ?? [])])],
        derivationNote: fragment.derivationNote ?? change.geometry?.derivationNote ?? null
      });
    }
  }
}

entries.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id));
fs.mkdirSync(path.dirname(outputFile), {recursive: true});
fs.writeFileSync(outputFile, JSON.stringify({
  schema_version: 1,
  dataset: 'Rulers of Russia verified boundary overlays',
  generatedAt: new Date().toISOString(),
  resolutionRule: 'A verified overlay is active from effectiveFrom through effectiveTo inclusive; null effectiveTo means it remains active until superseded by a later source-backed model update.',
  count: entries.length,
  entries
}, null, 2) + '\n');
console.log(`Verified boundary overlay index generated: ${entries.length} entries.`);
