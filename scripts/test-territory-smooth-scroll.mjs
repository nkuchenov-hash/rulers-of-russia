import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTimelineScrollGate} from '../src/app/territory/timelineScrollGate.mjs';

const gate = createTimelineScrollGate(3);
assert.equal(gate.shouldUpdateYear(0), true);
assert.equal(gate.isActive(), false, 'No pending smooth jump initially');
gate.begin(6000);
assert.equal(gate.isActive(), true, 'Smooth jump pending');
for (const left of [100, 500, 2500, 5996]) {
  assert.equal(gate.shouldUpdateYear(left), false, `Intermediate smooth scroll at ${left}px must not change year`);
}
assert.equal(gate.shouldUpdateYear(5998), true, 'Arrival releases the gate');
assert.equal(gate.isActive(), false);
assert.equal(gate.shouldUpdateYear(600), true, 'Normal manual scrolling resumes after arrival');
gate.begin(7000);
gate.begin(3000);
assert.equal(gate.shouldUpdateYear(7000), false, 'Superseded jump must not change the selected year');
assert.equal(gate.shouldUpdateYear(3000), true);
gate.begin(9000);
gate.cancel();
assert.equal(gate.isActive(), false, 'User interruption must clear the jump');
assert.equal(gate.shouldUpdateYear(120), true, 'Pointer, touch or wheel input must cancel the jump');
gate.begin(9000, 'auto');
assert.equal(gate.shouldUpdateYear(300), true, 'Immediate jumps must not gate scroll events');
gate.begin(9000);
assert.equal(gate.shouldUpdateYear(NaN), false);
assert.throws(() => gate.begin(NaN), RangeError);
assert.throws(() => createTimelineScrollGate(-1), RangeError);

// Browser scroll anchoring or an interrupted CSS smooth scroll may settle
// short of the requested offset without a pointer/touch/wheel event.
gate.begin(6000);
assert.equal(gate.shouldUpdateYear(1800), false, 'Unfinished smooth jump must still suppress intermediate years');
gate.cancel(); // onScrollEnd releases the gate and rechecks the settled offset.
assert.equal(gate.shouldUpdateYear(1800), true, 'A settled, interrupted scroll must restore ordinary year scrubbing');

// Guard the actual production wiring, not only the standalone helper.
const source = readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx', import.meta.url), 'utf8');
assert.match(source, /timelineScrollGateRef\.current\.begin\(left,behavior\)/,
  'Programmatic year jumps must arm the scroll gate before scrolling');
assert.match(source, /timelineScrollGateRef\.current\.shouldUpdateYear\(el\.scrollLeft\)/,
  'Scroll handler must not overwrite the selected year mid-animation');
assert.match(source, /onPointerDown=\{cancelTimelineJump\}/,
  'Dragging the ruler must restore manual year scrubbing');
assert.match(source, /onScrollEnd=\{onTimelineScrollEnd\}/,
  'Native scrollend must release an interrupted smooth jump');
assert.match(source, /function onTimelineScrollEnd\(\)\{if\(!timelineScrollGateRef\.current\.isActive\(\)\)return;timelineScrollGateRef\.current\.cancel\(\);onTimelineScroll\(\)\}/,
  'Scrollend must cancel the gate and resynchronize the visible year');
assert.match(source, /onTouchStart=\{cancelTimelineJump\}/,
  'Touch input must restore manual year scrubbing');
assert.match(source, /const now=performance\.now\(\);if\(now-timelineWheelRef\.current<62\)return;timelineWheelRef\.current=now;const wasJumping=timelineScrollGateRef\.current\.isActive\(\);timelineScrollGateRef\.current\.cancel\(\)/,
  'Only accepted wheel events may cancel a smooth jump');
assert.match(source, /const current=wasJumping\?year:clamp\(/,
  'Wheel interruption must step from the selected year, not an intermediate animated position');
console.log('Timeline smooth-jump gate and production integration checks passed.');
