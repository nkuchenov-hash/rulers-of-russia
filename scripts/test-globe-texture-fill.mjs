import assert from 'node:assert/strict';
import {geoArea, geoEquirectangular, geoPath} from 'd3-geo';
import {fillProjectedFeature} from '../src/app/territory/globeTextureFill.mjs';

const WIDTH = 4096;
const ctx = {
  commands: [], current: null, globalAlpha: 1, fillStyle: '',
  beginPath() { this.commands.push(['begin']); this.current = null; },
  moveTo(x, y) { this.commands.push(['move', x, y]); this.current = [x, y]; },
  lineTo(x, y) {
    assert(this.current, 'lineTo must follow moveTo');
    // A 2-degree antimeridian island must never draw a 358-degree
    // chord through the center of the world texture.
    assert(Math.abs(x - this.current[0]) < WIDTH / 2,
      'World-spanning chord found: the antimeridian was not clipped');
    this.commands.push(['line', x, y]);
    this.current = [x, y];
  },
  closePath() { this.commands.push(['close']); this.current = null; },
  arc(...args) { this.commands.push(['arc', ...args]); },
  fill(rule) { this.commands.push(['fill', rule, this.fillStyle, this.globalAlpha]); },
};
const projection = geoEquirectangular()
  .translate([WIDTH / 2, WIDTH / 4])
  .scale(WIDTH / (2 * Math.PI))
  .precision(.22);
const path = geoPath(projection, ctx);

function polygon(rings) {
  const feature = {type: 'Feature', properties: {}, geometry: {type: 'Polygon', coordinates: rings}};
  // D3's spherical winding convention must describe the small island,
  // not its >hemisphere complement.
  if (geoArea(feature) > 2 * Math.PI)
    feature.geometry.coordinates = rings.map(ring => [...ring].reverse());
  return feature;
}

const seamIsland = polygon([[
  [179, 10], [-179, 10], [-179, 20], [179, 20], [179, 10],
]]);
fillProjectedFeature(ctx, path, seamIsland, '#78905f', .94);
const moves = ctx.commands.filter(command => command[0] === 'move').length;
assert(moves >= 2, 'A dateline-crossing island must be clipped into separate texture-edge paths');
assert.deepEqual(ctx.commands.at(-1), ['fill', 'evenodd', '#78905f', .94]);

ctx.commands = [];
ctx.current = null;
const outer = [[-10, 0], [10, 0], [10, 20], [-10, 20], [-10, 0]];
const hole = [[-5, 5], [-5, 15], [5, 15], [5, 5], [-5, 5]];
fillProjectedFeature(ctx, path, polygon([outer, hole]), '#abc', .84);
assert(ctx.commands.filter(command => command[0] === 'move').length >= 2,
  'A polygon with a hole must retain both rings');
assert.deepEqual(ctx.commands.at(-1), ['fill', 'evenodd', '#abc', .84]);
console.log('Globe state texture: antimeridian clipping and interior-hole fill passed.');
