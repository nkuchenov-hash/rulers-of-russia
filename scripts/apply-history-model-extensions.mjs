import fs from 'node:fs';
import path from 'node:path';

const dataRoot = path.join(process.cwd(), 'public', 'data', 'history-core');
const modelFile = path.join(dataRoot, 'territory-model.json');
const extensionRoot = path.join(dataRoot, 'territory-model-extensions');

if (!fs.existsSync(modelFile)) throw new Error('Missing History Core territory-model.json');
const model = JSON.parse(fs.readFileSync(modelFile, 'utf8'));
model.fragments ??= [];
model.baseStates ??= [];

const byId = (items, label) => {
  const map = new Map();
  for (const item of items) {
    if (!item?.id) throw new Error(`${label} item has no id`);
    if (map.has(item.id)) throw new Error(`Duplicate ${label} id ${item.id}`);
    map.set(item.id, item);
  }
  return map;
};

const fragments = byId(model.fragments, 'fragment');
const baseStates = byId(model.baseStates, 'base state');
const extensionFiles = fs.existsSync(extensionRoot)
  ? fs.readdirSync(extensionRoot).filter(name => name.endsWith('.json')).sort()
  : [];

let addedFragments = 0;
let addedBaseStates = 0;
for (const name of extensionFiles) {
  const payload = JSON.parse(fs.readFileSync(path.join(extensionRoot, name), 'utf8'));
  for (const fragment of payload.fragments ?? []) {
    const existing = fragments.get(fragment.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(fragment)) {
        throw new Error(`History Core extension ${name} conflicts with existing fragment ${fragment.id}`);
      }
      continue;
    }
    model.fragments.push(fragment);
    fragments.set(fragment.id, fragment);
    addedFragments += 1;
  }
  for (const base of payload.baseStates ?? []) {
    const existing = baseStates.get(base.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(base)) {
        throw new Error(`History Core extension ${name} conflicts with existing base state ${base.id}`);
      }
      continue;
    }
    model.baseStates.push(base);
    baseStates.set(base.id, base);
    addedBaseStates += 1;
  }
}

fs.writeFileSync(modelFile, JSON.stringify(model, null, 2) + '\n');
console.log(`History Core model extensions applied: ${extensionFiles.length} files, +${addedFragments} fragments, +${addedBaseStates} base states.`);
