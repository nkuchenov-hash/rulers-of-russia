// The requested world-snapshot fetch can run ahead of the committed React
// render. Accuracy captions must describe the world year actually displayed,
// not the last requested network resource. React's story text is the source
// of truth for the visible background snapshot.
export function renderedWorldSnapshotYear(text) {
  if (typeof text !== 'string') return null;
  const match = /^Исторический мировой срез\s+(\d{3,4})\s+года(?:\s*·|$)/u.exec(text.trim());
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) && year > 0 ? year : null;
}
