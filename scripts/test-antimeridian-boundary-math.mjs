import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boundaryGrid, boundaryMidpointLongitude, nearBoundary} from '../src/app/territory/antimeridianBoundaryMath.mjs';

const polygon = ring => ({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}});
const eastToWest = polygon([[179,50],[-179,50],[-179,51],[179,51],[179,50]]);
const westToEast = polygon([[-179,50],[179,50],[179,51],[-179,51],[-179,50]]);
assert.equal(boundaryMidpointLongitude(179,-179),-180);
assert.equal(boundaryMidpointLongitude(-179,179),-180);
assert.equal(boundaryMidpointLongitude(30,40),35);
assert.equal(boundaryMidpointLongitude(179,178),178.5);
assert.ok(Number.isNaN(boundaryMidpointLongitude(NaN,40)));

for (const feature of [eastToWest, westToEast]) {
  const grid = boundaryGrid([feature]);
  assert.equal(nearBoundary(180,50,grid),true,'crossing at +180 must be found');
  assert.equal(nearBoundary(-180,50,grid),true,'crossing at -180 must be found');
  assert.equal(nearBoundary(179.5,50,grid),true,'east side must be found');
  assert.equal(nearBoundary(-179.5,50,grid),true,'west side must be found');
  assert.equal(nearBoundary(0,50,grid),false,'must not invent a Greenwich edge');
  assert.equal(nearBoundary(180,60,grid),false,'must not invent distant edges');
}
const regular = boundaryGrid([polygon([[30,50],[31,50],[31,51],[30,51],[30,50]])]);
assert.equal(nearBoundary(30.5,50,regular),true);
assert.equal(nearBoundary(40,50,regular),false);

// Guard the integration as well as the isolated geometry: the actual globe
// must use the wrapped midpoint and periodic proximity index.
const globe = fs.readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx',import.meta.url),'utf8');
assert.match(globe,/import\s*\{[^}]*boundaryMidpointLongitude[^}]*\}\s*from '\.\/antimeridianBoundaryMath\.mjs'/);
assert.match(globe,/midLon=boundaryMidpointLongitude\(Number\(a\[0\]\),Number\(b\[0\]\)\)/);
assert.match(globe,/nearBoundary\(midLon,midLat,excludeGrid\)/);
console.log('Globe antimeridian boundary suppression tests passed.');
