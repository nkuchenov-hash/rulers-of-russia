import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'public', 'data', 'history-core');
const eventsRoot = path.join(dataRoot, 'events');
const outputRoot = path.join(dataRoot, 'generated');
const outputFile = path.join(outputRoot, 'event-index.json');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

const files = fs.existsSync(eventsRoot)
  ? fs.readdirSync(eventsRoot).filter(name => name.endsWith('.json')).sort()
  : [];

const events = [];
const ids = new Set();
for (const name of files) {
  const payload = readJson(path.join(eventsRoot, name));
  for (const event of payload.events ?? []) {
    if (!event.id) throw new Error(`History event without id in ${name}`);
    if (ids.has(event.id)) throw new Error(`Duplicate history event id ${event.id}`);
    ids.add(event.id);
    events.push({...event, __sourceFile: `events/${name}`});
  }
}

const sortKey = event => {
  const value = event.date?.normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return value;
  if (/^\d{4}-\d{2}$/.test(value ?? '')) return `${value}-01`;
  if (/^\d{4}$/.test(value ?? '')) return `${value}-01-01`;
  return '9999-12-31';
};
events.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id));

const add = (record, key, id) => {
  if (!key) return;
  const list = record[key] ?? [];
  if (!list.includes(id)) list.push(id);
  record[key] = list;
};

const byMonth = {};
const byYear = {};
const byRuler = {};
const byPolity = {};
const byKind = {};
const byTerritoryChange = {};
const unresolvedDateIds = [];

for (const event of events) {
  const normalized = event.date?.normalized ?? '';
  const month = /^(\d{4}-\d{2})(?:-\d{2})?$/.exec(normalized)?.[1] ?? null;
  const year = /^(\d{4})/.exec(normalized)?.[1] ?? null;
  if (month && (event.date?.precision === 'day' || event.date?.precision === 'month')) add(byMonth, month, event.id);
  if (year) add(byYear, year, event.id);
  else unresolvedDateIds.push(event.id);
  for (const rulerId of event.rulerIds ?? []) add(byRuler, rulerId, event.id);
  for (const polityId of event.polityIds ?? []) add(byPolity, polityId, event.id);
  add(byKind, event.kind, event.id);
  for (const changeId of event.territoryChangeIds ?? []) add(byTerritoryChange, changeId, event.id);
}

const publicEvents = events.map(({__sourceFile, ...event}) => ({...event, sourceFile: __sourceFile}));
const output = {
  schema_version: 1,
  dataset: 'Rulers of Russia reusable historical event index',
  generated_at: new Date().toISOString(),
  eventCount: publicEvents.length,
  files,
  events: publicEvents,
  byMonth,
  byYear,
  byRuler,
  byPolity,
  byKind,
  byTerritoryChange,
  unresolvedDateIds,
};
fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(outputFile, JSON.stringify(output));
console.log(`History event index generated: ${publicEvents.length} events, ${Object.keys(byMonth).length} exact month buckets, ${Object.keys(byYear).length} year buckets.`);
