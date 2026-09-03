import fs from 'node:fs';

const relationId = '2800968';
const url = `https://api.openhistoricalmap.org/api/0.6/relation/${relationId}`;
const response = await fetch(url, {headers:{'User-Agent':'rulers-of-russia-history-core/1.0'}});
if (!response.ok) throw new Error(`OHM relation fetch failed: ${response.status}`);
const xml = await response.text();
const relationMatch = xml.match(/<relation\s+([^>]+)>/);
if (!relationMatch) throw new Error('OHM relation element missing');
const attr = key => relationMatch[1].match(new RegExp(`${key}="([^"]*)"`))?.[1] ?? null;
const tags = {};
for (const match of xml.matchAll(/<tag\s+k="([^"]+)"\s+v="([^"]*)"\s*\/>/g)) tags[match[1]] = match[2];
const report = {
  schema_version: 1,
  relation_id: relationId,
  url,
  version: attr('version'),
  timestamp: attr('timestamp'),
  changeset: attr('changeset'),
  visible: attr('visible'),
  tags,
  explicit_license_tag: tags.license ?? null,
  note: 'OpenHistoricalMap states that its data is CC0/public domain except where an individual element is otherwise licensed. This capture exposes the source relation license tag, if any, instead of assuming the default blindly.'
};
fs.writeFileSync('ohm-rf-relation-2800968.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
