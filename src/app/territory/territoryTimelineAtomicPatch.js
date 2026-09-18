// HistoricalTerritoryGlobeWebGLV21 updates the selected year both directly
// and from the timeline scroll position. A smooth programmatic jump across a
// large range therefore emits hundreds of intermediate scroll states, which
// can race History Core fetches and leave the visible year paired with stale
// territory geometry. Keep direct timeline interaction intact, but make
// programmatic smooth jumps on the territory ruler atomic.

const PATCH_KEY = Symbol.for('rulers-of-russia.territory-timeline-atomic-scroll.v1');

if (typeof Element !== 'undefined' && Element.prototype.scrollTo && !Element.prototype[PATCH_KEY]) {
  const originalScrollTo = Element.prototype.scrollTo;

  Object.defineProperty(Element.prototype, PATCH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: true,
  });

  Element.prototype.scrollTo = function patchedTerritoryScrollTo(...args) {
    const first = args[0];
    const isTerritoryRuler = this?.classList
      ? [...this.classList].some((name) => String(name).includes('rulerViewport'))
      : false;

    if (isTerritoryRuler && first && typeof first === 'object' && first.behavior === 'smooth') {
      return originalScrollTo.call(this, { ...first, behavior: 'auto' });
    }

    return originalScrollTo.apply(this, args);
  };
}
