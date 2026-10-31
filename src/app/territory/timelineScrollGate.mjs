// Smooth programmatic jumps must not scrub all intermediate historical years.
// Explicit user input cancels the gate and restores ordinary ruler scrubbing.
export function createTimelineScrollGate(tolerancePx = 3) {
  if (!Number.isFinite(tolerancePx) || tolerancePx < 0) throw new RangeError('Invalid timeline tolerance');
  let target = null;
  return {
    begin(left, behavior = 'smooth') {
      if (!Number.isFinite(left) || left < 0) throw new RangeError('Invalid timeline target');
      target = behavior === 'smooth' ? left : null;
    },
    cancel() { target = null; },
    shouldUpdateYear(left) {
      if (target === null) return true;
      if (!Number.isFinite(left)) return false;
      if (Math.abs(left - target) <= tolerancePx) {
        target = null;
        return true;
      }
      return false;
    },
  };
}
