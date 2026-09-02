import assert from 'node:assert/strict';
import {materializeRasterGeometry, transformRasterPoint, validateRasterGeoreference} from './lib/raster-georeference.mjs';

const raster = {
  url: 'https://example.invalid/map.png',
  sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  width: 101,
  height: 101
};
const georeference = {
  method: 'piecewise-affine-triangulation',
  uncertaintyKm: 5,
  gcps: [
    {id: 'nw', pixel: [0, 0], lonLat: [20, 60]},
    {id: 'ne', pixel: [100, 0], lonLat: [30, 60]},
    {id: 'se', pixel: [100, 100], lonLat: [30, 50]},
    {id: 'sw', pixel: [0, 100], lonLat: [20, 50]}
  ],
  triangles: [[0, 1, 2], [0, 2, 3]]
};

validateRasterGeoreference(georeference, raster);
assert.deepEqual(transformRasterPoint([50, 50], georeference, raster).lonLat.map(v => Number(v.toFixed(8))), [25, 55]);
assert.deepEqual(transformRasterPoint([25, 75], georeference, raster).lonLat.map(v => Number(v.toFixed(8))), [22.5, 52.5]);

const geometry = materializeRasterGeometry({
  sourceRaster: raster,
  georeference,
  pixelRings: [[[10, 10], [90, 10], [90, 90], [10, 90]]]
}, 'Polygon');
assert.equal(geometry.type, 'Polygon');
assert.equal(geometry.coordinates[0].length, 5);
assert.deepEqual(geometry.coordinates[0][0].map(v => Number(v.toFixed(8))), [21, 59]);
assert.deepEqual(geometry.coordinates[0].at(-1).map(v => Number(v.toFixed(8))), [21, 59]);

assert.throws(() => transformRasterPoint([120, 50], georeference, raster), /outside source raster/);
assert.throws(() => validateRasterGeoreference({...georeference, uncertaintyKm: 0}, raster), /uncertaintyKm/);

console.log('Raster georeference tests passed.');
