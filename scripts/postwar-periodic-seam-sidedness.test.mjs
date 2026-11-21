import assert from 'node:assert/strict';
import test from 'node:test';

// Diagnostic only. Synthetic planar seam-adjacent rectangles, not historical evidence.
// The two signed representations of the antimeridian refer to one meridian.
const west = [[170,65],[180,65],[180,69],[170,69],[170,65]];
const east = [[-180,65],[-170,65],[-170,69],[-180,69],[-180,65]];
const duplicateWest = west.map(([lon,lat])=>[lon-360,lat]);

function containsStrict(ring,[x,y]) {
  // Query points in these tests are strictly interior/exterior, never on edges.
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function occupancy(ring,latitude,epsilon=0.01) {
  return {west:containsStrict(ring,[180-epsilon,latitude]) ||
                 containsStrict(ring,[-180-epsilon,latitude]),
          east:containsStrict(ring,[-180+epsilon,latitude]) ||
                 containsStrict(ring,[180+epsilon,latitude])};
}
function seamIntervals(ring) {
  const intervals=[];
  for(let i=0;i<ring.length-1;i++) {
    const [x,y]=ring[i], [u,v]=ring[i+1];
    if(Math.abs(Math.abs(x)-180)<1e-10 &&
       Math.abs(Math.abs(u)-180)<1e-10 && y!==v)
      intervals.push([Math.min(y,v),Math.max(y,v)]);
  }
  return intervals;
}
function overlap([a,b],[c,d]) {return Math.max(0,Math.min(b,d)-Math.max(a,c));}
function sharedSeamLength(a,b) {
  return seamIntervals(a).reduce((sum,interval)=>
    sum+seamIntervals(b).reduce((n,other)=>n+overlap(interval,other),0),0);
}
test('opposite sides of the periodic seam share a boundary but no interior',()=>{
  assert.equal(sharedSeamLength(west,east),4);
  assert.deepEqual(occupancy(west,67),{west:true,east:false});
  assert.deepEqual(occupancy(east,67),{west:false,east:true});
});
test('identical-side translated copies have overlapping interiors',()=>{
  assert.equal(sharedSeamLength(west,duplicateWest),4);
  assert.deepEqual(occupancy(duplicateWest,67),{west:true,east:false});
  assert.deepEqual(occupancy(west,67),occupancy(duplicateWest,67));
});
test('boundary overlap does not imply the same sidedness across all latitudes',()=>{
  const partial=[[-180,66],[-170,66],[-170,68],[-180,68],[-180,66]];
  assert.equal(sharedSeamLength(west,partial),2);
  assert.deepEqual(occupancy(partial,67),{west:false,east:true});
  assert.deepEqual(occupancy(partial,65.5),{west:false,east:false});
});
test('seam endpoint contact is zero length and cannot determine interior topology',()=>{
  const adjacent=[[-180,69],[-170,69],[-170,71],[-180,71],[-180,69]];
  assert.equal(sharedSeamLength(west,adjacent),0);
  assert.deepEqual(occupancy(adjacent,70),{west:false,east:true});
});

// This is only a counterexample to inferring area overlap from seam-edge coincidence.
// It does not classify the actual USSR 1945 MultiPolygon or validate its history.
