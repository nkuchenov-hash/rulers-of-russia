import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root = process.cwd();
const startMonth = process.env.RUNIVERS_START_MONTH;
const endMonth = process.env.RUNIVERS_END_MONTH;
const sourceDiscoveryFile = process.env.RUNIVERS_DISCOVERY_FILE || path.join(root, 'tmp', 'runivers-discovery', 'runivers-current-baseline.json');
const monthIndexFile = path.join(root, 'public', 'data', 'history-core', 'generated', 'month-index.json');
const validatorFile = path.join(root, 'scripts', 'validate-runivers-regression.mjs');

if (!/^\d{4}-\d{2}$/.test(startMonth || '') || !/^\d{4}-\d{2}$/.test(endMonth || '') || startMonth > endMonth) {
  throw new Error(`Invalid Runivers shard range: ${startMonth || '<missing>'}..${endMonth || '<missing>'}`);
}
if (!fs.existsSync(sourceDiscoveryFile)) throw new Error(`Runivers discovery report missing: ${sourceDiscoveryFile}`);
if (!fs.existsSync(monthIndexFile)) throw new Error(`History month index missing: ${monthIndexFile}`);
if (!fs.existsSync(validatorFile)) throw new Error(`Runivers validator missing: ${validatorFile}`);

const startYear = Number(startMonth.slice(0, 4));
const endYear = Number(endMonth.slice(0, 4));
const slug = `${startMonth.replace('-', '')}-${endMonth.replace('-', '')}`;
const shardDir = path.join(root, 'tmp', 'runivers-shards', slug);
fs.mkdirSync(shardDir, {recursive: true});

const discovery = JSON.parse(fs.readFileSync(sourceDiscoveryFile, 'utf8'));
const originalLayers = discovery.vectorLayers ?? [];
discovery.vectorLayers = originalLayers.filter((layer) => Number.isInteger(layer.fromYear)
  && Number.isInteger(layer.toYear)
  && layer.toYear >= startYear
  && layer.fromYear <= endYear);
if (!discovery.vectorLayers.length) throw new Error(`No Runivers layers overlap ${startMonth}..${endMonth}`);
const shardDiscoveryFile = path.join(shardDir, 'runivers-baseline.json');
fs.writeFileSync(shardDiscoveryFile, JSON.stringify(discovery, null, 2));

const monthIndex = JSON.parse(fs.readFileSync(monthIndexFile, 'utf8'));
const originalMonthCount = monthIndex.months?.length ?? 0;
monthIndex.months = (monthIndex.months ?? []).filter((row) => row.month >= startMonth && row.month <= endMonth);
if (!monthIndex.months.length) throw new Error(`No History Core months overlap ${startMonth}..${endMonth}`);
fs.writeFileSync(monthIndexFile, JSON.stringify(monthIndex, null, 2));

console.log(`Runivers shard ${startMonth}..${endMonth}: ${discovery.vectorLayers.length}/${originalLayers.length} layers; ${monthIndex.months.length}/${originalMonthCount} History Core months.`);

const child = spawnSync(process.execPath, ['--import', path.join(root, 'scripts', 'runivers-fetch-cache.mjs'), validatorFile], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    RUNIVERS_DISCOVERY_FILE: shardDiscoveryFile,
  },
});
if (child.error) throw child.error;

const reportFile = path.join(root, 'tmp', 'runivers-regression', 'report.json');
if (fs.existsSync(reportFile)) {
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  report.shard = {startMonth, endMonth};
  if (report.summary) report.summary.auditedRange = {startMonth, endMonth};
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
}

process.exitCode = child.status ?? 1;
