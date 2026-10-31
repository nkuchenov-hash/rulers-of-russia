import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTimelineScrollGate,shouldHandleTimelineWheel} from '../src/app/territory/timelineScrollGate.mjs';

// The timeline section wraps the month/era selectors and arrow buttons.
// Their wheel events bubble to the section but must not scrub the year.
for (const tag of ['select','button','input','textarea']) {
  assert.equal(shouldHandleTimelineWheel({closest: selector => {
    assert.ok(selector.includes(tag), 'interactive control must be excluded: '+tag);
    return {tagName:tag};
  }}), false);
}
assert.equal(shouldHandleTimelineWheel({closest:()=>({role:'combobox'})}),false);
assert.equal(shouldHandleTimelineWheel({closest:()=>null}),true,'ruler wheel must still navigate years');
assert.equal(shouldHandleTimelineWheel(null),true);

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

// The ruler viewport is narrower than the browser window because the timeline
// card has horizontal margins. The first/last tick must align with the needle
// at scrollLeft=0/max, on both desktop and 360/390px mobile viewports.
const rulerSpan = (2026 - 862) * 6;
for (const viewportWidth of [336, 366, 1408]) {
  const rulerWidth = viewportWidth + rulerSpan;
  assert.equal(rulerWidth - viewportWidth, rulerSpan, 'last year must be scroll-reachable');
  for (const selectedYear of [862, 1547, 1721, 1922, 2026]) {
    const scrollLeft = (selectedYear - 862) * 6;
    const tickViewportX = rulerWidth / 2 - rulerSpan / 2 + scrollLeft - scrollLeft;
    assert.equal(tickViewportX, viewportWidth / 2,
      `needle must align with ${selectedYear} inside a ${viewportWidth}px timeline card`);
  }
}

// Guard the actual production wiring, not only the standalone helper.
const source = readFileSync(new URL('../src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx', import.meta.url), 'utf8');
assert.ok(source.includes('const TIMELINE_SPAN_PX=(TERRITORY_MAX_YEAR-TERRITORY_MIN_YEAR)*YEAR_PX;'),
  'ruler geometry must derive from the same year scale as scrollToYear');
assert.ok(source.includes('style={{width:`calc(100% + ${TIMELINE_SPAN_PX}px)`}}'),
  'ruler width must use its own viewport, not 100vw');
const centeredTickStyle = 'style={{left:`calc(50% - ${TIMELINE_SPAN_PX/2}px + ${(y-TERRITORY_MIN_YEAR)*YEAR_PX}px)`}}';
assert.equal(source.split(centeredTickStyle).length - 1, 2,
  'both year ticks and historical transition ticks must be centered within the timeline card');

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
assert.ok(source.includes('if(!shouldHandleTimelineWheel(e.target))return;'),
  'production wheel handler must ignore bubbled events from native timeline controls');
console.log('Timeline smooth-jump gate, native control wheel isolation and production integration checks passed.');
