import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const source = readJson('public/data/territory/rusmap/state-muscovy.geojson');
const manifest = readJson('public/data/territory/rusmap/source-manifest.json');
const coverage = readJson('public/data/history-core/coverage-periods.json');
const months = readJson('public/data/history-core/generated/month-index.json');

assert.equal(source.type, 'FeatureCollection');
assert.equal(source.metadata.license, 'ODbL-1.0');
assert.equal(source.metadata.upstream_sha256, manifest.upstream_sha256);
assert.match(source.metadata.upstream_sha256, /^[0-9a-f]{64}$/);
assert.equal(source.features.length, 17);
assert.equal(source.features.filter(f => f.properties.certainty === 'schematic').length, 4);
assert.deepEqual(
  source.features.map(f => f.properties.from),
  ['1485','1521','1537','1547-01-16','1552','1556','1595-05-18',
   '1617-02-17','1640','1667-02-09','1686-05-06','1689-08-27',
   '1699','1709','1717','1719-05','1720'],
);
assert.ok(source.features.every(f => f.properties.history_core_status === 'reconstruction-provisional'));
for (const f of source.features) {
  if (/^\d{4}$/.test(f.properties.from)) {
    assert.equal(f.properties.start_date, f.properties.from + '-12',
      'Year-only source dates are conservatively anchored in December, not invented days');
  } else {
    assert.equal(f.properties.start_date, f.properties.from);
  }
}

// Spatial plausibility controls check *which* candidate polygons are present.
// They do not certify the historical positions of their boundaries.
function insideRing([lon, lat], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[j];
    if ((ay > lat) !== (by > lat) && lon < (bx - ax) * (lat - ay) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}
function insideFeature(point, feature) {
  const {type, coordinates} = feature.geometry;
  const polygons = type === 'Polygon' ? [coordinates] : coordinates;
  return polygons.some(rings =>
    rings.length > 0 && insideRing(point, rings[0]) &&
    !rings.slice(1).some(hole => insideRing(point, hole))
  );
}
const byFrom = (date) => {
  const f = source.features.find(x => x.properties.from === date);
  assert.ok(f, 'Missing source version ' + date);
  return f;
};
const KAZAN = [49.12,55.79], ASTRAKHAN = [48.04,46.35], MOSCOW = [37.62,55.75];
assert.equal(insideFeature(KAZAN, byFrom('1547-01-16')), false);
assert.equal(insideFeature(KAZAN, byFrom('1552')), true);
assert.equal(insideFeature(ASTRAKHAN, byFrom('1552')), false);
assert.equal(insideFeature(ASTRAKHAN, byFrom('1556')), true);
assert.ok(source.features.every(f => insideFeature(MOSCOW, f)), 'Moscow must remain inside');

// The generated monthly selection, not merely the checked-in source,
// must actually reach the user-facing globe.
assert.equal(months.monthCount, 13980);
const sourceFile = 'data/territory/rusmap/state-muscovy.geojson';
const sourcedPeriods = coverage.periods.filter(p => p.fallbackGeometryFile === sourceFile);
assert.equal(sourcedPeriods.length, 4, 'Muscovy source must cover Grand Moscow, Tsardom, and all of 1721 through the November title transition');
const seenSourceVersions = new Set();
let sourcedMonths = 0;
for (const item of months.months) {
  const inSourcedPeriod = sourcedPeriods.some(p =>
    p.startMonth <= item.month && p.endMonth >= item.month
  );
  if (!inSourcedPeriod) {
    assert.ok(!item.displayGeometryFile, 'Display override leaked outside its time period');
    continue;
  }
  sourcedMonths++;
  assert.ok(item.displayGeometryFile, 'Missing visible display geometry for ' + item.month);
  assert.equal(item.displayStatus, 'reconstruction-provisional');
  assert.equal(item.displaySourceLicense, 'ODbL-1.0');
  assert.equal(item.displaySourceUrl, 'https://rusmap.org/data/');
  assert.equal(item.displaySourceAttribution, 'Историческая карта России, rusmap.org');
  const output = readJson('public/' + item.displayGeometryFile);
  assert.equal(output.features.length, 1, 'Successive whole-state contours must not be unioned');
  const f = output.features[0];
  seenSourceVersions.add(f.properties.from);
  assert.equal(output.metadata.sourceCertainty, f.properties.certainty);
  assert.equal(item.displaySourceCertainty, f.properties.certainty);
  assert.equal(item.displayConfidence, f.properties.certainty === 'schematic' ? 'low' :
    sourcedPeriods.find(p => p.startMonth <= item.month && p.endMonth >= item.month).confidence);
  assert.equal(output.metadata.sourceLicense, 'ODbL-1.0');
  assert.equal(f.properties.history_core_status, 'reconstruction-provisional');
  if (item.status === 'geometry-verified') {
    assert.notEqual(item.geometryFile, item.displayGeometryFile,
      'Display choice must never replace the audited History Core polygon');
    assert.ok(item.snapshotId, 'Verified history lineage must remain recorded');
  }
}
assert.ok(sourcedMonths > 2000, `Imported contours insufficient: ${sourcedMonths} displayed months, ${seenSourceVersions.size} versions [${[...seenSourceVersions].join(', ')}]`);
assert.equal(seenSourceVersions.size, 17, 'All 17 dated versions should reach the user');

// The 1721 extension must retain its provisional source and make the
// post-September carry-forward explicit instead of implying a verified border.
const jan1721 = months.months.find(item => item.month === '1721-01');
const oct1721 = months.months.find(item => item.month === '1721-10');
const nov1721 = months.months.find(item => item.month === '1721-11');
assert.equal(jan1721.politicalPolityId, 'russian-tsardom');
assert.equal(oct1721.politicalPolityId, 'russian-tsardom');
assert.equal(oct1721.displayExpiredProxy, true);
assert.equal(oct1721.displaySourceLicense, 'ODbL-1.0');
assert.equal(nov1721.politicalPolityId, 'russian-empire');
assert.ok(nov1721.displayGeometryFile, 'November 1721 must preserve the same provisional source contour across the title transition');
// Separate coverage periods produce different file names and provenance metadata.
// Compare the actual drawn coordinates, not the generated asset paths.
const displayedCoordinates = item => readJson(`public/${item.displayGeometryFile}`).features.map(feature => feature.geometry);
assert.deepEqual(displayedCoordinates(nov1721), displayedCoordinates(oct1721),
  'The imperial title change alone must not cause a territorial jump');
assert.equal(nov1721.displayExpiredProxy, true);
assert.equal(nov1721.displaySourceLicense, 'ODbL-1.0');
const dec1721 = months.months.find(item => item.month === '1721-12');
assert.ok(!dec1721.displayGeometryFile, 'The Muscovy display override must end after November 1721');

console.log('Muscovy ODbL source: 17 versions, Kazan/Astrakhan spatial controls,',
  sourcedMonths, 'visible provisional-reconstruction months,',
  seenSourceVersions.size, 'distinct visible source versions.');