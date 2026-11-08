import test from 'node:test';
import assert from 'node:assert/strict';
import {contains} from './postwar-controls.mjs';

// Regression reproducer only. Existing point containment interprets a
// 179 -> -179 edge as a 358-degree segment instead of a dateline crossing.
test('dateline-crossing polygon includes both sides and excludes Greenwich', () => {
  const island = {type:'Polygon',coordinates:[
    [[179,50],[-179,50],[-179,52],[179,52],[179,50]],
  ]};
  assert.equal(contains(island,179.5,51),true);
  assert.equal(contains(island,-179.5,51),true);
  assert.equal(contains(island,0,51),false);
});

test('ordinary polygon with hole remains supported', () => {
  const polygon = {type:'Polygon',coordinates:[
    [[20,40],[30,40],[30,50],[20,50],[20,40]],
    [[24,44],[26,44],[26,46],[24,46],[24,44]],
  ]};
  assert.equal(contains(polygon,22,42),true);
  assert.equal(contains(polygon,25,45),false);
  assert.equal(contains(polygon,35,45),false);
});
