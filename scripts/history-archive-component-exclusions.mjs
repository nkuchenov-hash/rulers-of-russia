import assert from 'node:assert/strict';

export function excludeArchiveComponents(polygons, exclusions, evidenceDocumentIds) {
  if (!exclusions?.length) return polygons;
  const removed = new Set();
  for (const item of exclusions) {
    assert(Number.isInteger(item.index) && item.index >= 0 && item.index < polygons.length, 'Excluded component index out of range');
    assert(!removed.has(item.index), 'Duplicate excluded component');
    assert(item.note && evidenceDocumentIds.includes(item.evidenceDocumentId), 'Excluded component requires documentary evidence');
    const points = polygons[item.index].flat();
    const bbox = [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    assert.deepEqual(bbox,item.expectedBbox,'Excluded component identity changed');
    removed.add(item.index);
  }
  const result=polygons.filter((_,index)=>!removed.has(index));
  assert(result.length>0,'Component exclusions removed all geometry');
  return result;
}
