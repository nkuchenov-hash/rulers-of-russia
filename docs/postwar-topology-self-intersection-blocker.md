# Non-zero-area self-intersection: diagnostic topology blocker (2026-11-08)

## Reproducible counterexample
The current `unwrapRing` in `scripts/postwar-controls.mjs` checks closure and nonzero shoelace area, but does **not** check simple-ring topology.

A self-intersecting polygon ring can have nonzero shoelace area:

```js
import {contains} from './scripts/postwar-controls.mjs';
const ring = [[0,0],[4,4],[0,4],[4,0],[0,3],[0,0]];
const geometry = {type:'Polygon',coordinates:[ring]};
console.log(contains(geometry,1,1)); // currently returns a boolean; should reject invalid topology
```

The first and third non-adjacent segments intersect at (2,2). The shoelace sum is **+12** (signed area +6 square coordinate units), hence the existing zero-area check cannot catch it. This is a synthetic geometry counterexample, not a historical boundary reference.

## Acceptance criteria
- Reject any crossing or non-adjacent touching edges, including collinear overlap, without incorrectly rejecting a legitimate adjacent shared endpoint.
- Check all outer and hole rings, and reject malformed geometry even if an earlier polygon contains the query point.
- Respect antimeridian unwrapping and disallow ambiguous 180-degree edges.
- Preserve the existing dense 140,000-vertex test without quadratic runtime/memory growth; naive O(n²) all-pairs intersection is not an acceptable production fix.
- Add adversarial regression tests for crossing, touch, overlap, dateline, and large rings; benchmark time and memory on CI.
- Independently validate topology and compare historically dated borders against rights-cleared reference geometry. Topological validity alone does not establish historical accuracy.

## Status
**Unresolved.** No self-intersection detection has been implemented. Do not merge PR #562 on the assumption that the diagnostic accepts only valid polygon topology. Independent licensed historical-boundary comparisons remain at zero.
