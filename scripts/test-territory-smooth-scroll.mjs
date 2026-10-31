import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTimelineScrollGate} from '../src/app/territory/timelineScrollGate.mjs';

const gate = createTimelineScrollGate(3);
assert.equal(gate.shouldUpdateYear(0), true);
gate.begin(6000);
for (const left of [100, 500, 2500, 5996]) {
  assert.equal(gate.shouldUpdateYear(left), false, `Intermediate smooth scroll at ${left}px must not change year`);
}
assert.equal(gate.shouldUpdateYear(5998), true, 'Arrival releases the gate');
assert.equal(gate.shouldUpdateYear(600), true, 'Normal manual scrolling resumes after arrival');
gate.begin(7000);
gate.begin(3000);
assert.equal(gate.shouldUpdateYear(7000), false, 'Superseded jump must not change the selected year');
assert.equal(gate.shouldUpdateYear(3000), true);
gate.begin(9000);
gate.cancel();
assert.equal(gate.shouldUpdateYear(120), true, 'Pointer, touch or wheel input must cancel the jump');
gate.begin(9000, 'auto');
assert.equal(gate.shouldUpdateYear(300), true, 'Immediate jumps must not gate scroll events');
gate.begin(9000);
assert.equal(gate.shouldUpdateYear(NaN), false);
assert.throws(() => gate.begin(NaN), RangeError);
assert.throws(() => createTimelineScrollGate(-1), RangeError);

// Guard the actual production wiring, not only the standalone helper.
const source = readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx', import.meta.url), 'utf8');
assert.match(source, /timelineScrollGateRef\.current\.begin\(left,behavior\)/,
  'Programmatic year jumps must arm the scroll gate before scrolling');
assert.match(source, /timelineScrollGateRef\.current\.shouldUpdateYear\(el\.scrollLeft\)/,
  'Scroll handler must not overwrite the selected year mid-animation');
assert.match(source, /onPointerDown=\{cancelTimelineJump\}/,
  'Dragging the ruler must restore manual year scrubbing');
assert.match(source, /onTouchStart=\{cancelTimelineJump\}/,
  'Touch input must restore manual year scrubbing');
assert.match(source, /timelineScrollGateRef\.current\.cancel\(\);const now=performance\.now\(\)/,
  'Wheel input must interrupt an active programmatic jump');
console.log('Timeline smooth-jump gate and production integration checks passed.');
