#!/usr/bin/env node
// Diagnostic only: point containment does not establish historical border accuracy.
import fs from 'node:fs';
import {assertSimpleRing,assertDisjointRingBoundaries} from './postwar-ring-topology.mjs';
export const controls = Object.freeze([
{name:'Moscow',lon:37.6173,lat:55.7558,inside:true},
{name:'Kyiv',lon:30.5234,lat:50.4501,inside:true},
{name:'Vilnius',lon:25.2797,lat:54.6872,inside:true},
{name:'Kaliningrad',lon:20.4522,lat:54.7104,inside:true},
{name:'Yuzhno-Sakhalinsk',lon:142.738,lat:46.9591,inside:true},
{name:'Vladivostok',lon:131.8855,lat:43.1155,inside:true},
{name:'Warsaw',lon:21.0122,lat:52.2297,inside:false},
{name:'Helsinki',lon:24.9384,lat:60.1699,inside:false}
]);
// Unwrap short antimeridian edges. Long edges >=180 degrees are ambiguous.
function unwrapRing(ring) {
 if(!Array.isArray(ring)||ring.length<4) throw Error('Invalid polygon ring');
 const out=[];
 for(const p of ring) {
  if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90) throw Error('Invalid lon/lat coordinate');
  let x=p[0];
  if(out.length) {
   const prev=out.at(-1)[0];
   x+=360*Math.round((prev-x)/360);
   if(Math.abs(x-prev)>=180) throw Error('Ambiguous 180-degree edge');
  }
  out.push([x,p[1]]);
 }
 if(ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]) throw Error('Unclosed polygon ring');
 if(Math.abs(out.at(-1)[0]-out[0][0])>1e-8) throw Error('Ring winds around globe; planar diagnostic unsupported');
 // Reject zero-area rings: ray casting can otherwise classify points on a line as inside.
 let twiceArea=0;
 for(let i=1;i<out.length;i++) twiceArea+=out[i-1][0]*out[i][1]-out[i][0]*out[i-1][1];
 if(twiceArea===0) throw Error('Degenerate zero-area polygon ring');
 assertSimpleRing(out);
 return out;
}
function onSegment(x,y,a,b) {
 const dx=b[0]-a[0],dy=b[1]-a[1];
 return Math.abs((x-a[0])*dy-(y-a[1])*dx)<=1e-10&&(x-a[0])*(x-b[0])<=1e-10&&(y-a[1])*(y-b[1])<=1e-10;
}
function inRing(lon,lat,rawRing) {
 const ring=unwrapRing(rawRing);
 let minLon=Infinity,maxLon=-Infinity;
 for(const [x] of ring) {if(x<minLon) minLon=x;if(x>maxLon) maxLon=x;}
 const mid=(minLon+maxLon)/2;
 const center=lon+360*Math.round((mid-lon)/360);
 for(const x of [center-360,center,center+360]) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
   const a=ring[j],b=ring[i];
   if(onSegment(x,lat,a,b)) return true;
   if((a[1]>lat)!==(b[1]>lat)&&x<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  if(inside) return true;
 }
 return false;
}
export function contains(geometry,lon,lat) {
 if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type)) throw Error('Expected Polygon/MultiPolygon');
 if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90) throw Error('Invalid query coordinate');
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
 if(!Array.isArray(polygons)||polygons.length===0) throw Error('Empty or invalid polygon collection');
 // Evaluate every ring, even after a match: malformed later geometry must fail closed.
 // Short-circuiting some() previously hid invalid holes and subsequent polygons.
 let contained=false;
 for(const [polygonIndex,poly] of polygons.entries()) {
  if(!Array.isArray(poly)||poly.length===0) throw Error('Invalid polygon coordinates');
  const outerContains=inRing(lon,lat,poly[0]);
  let inHole=false;
  for(const [holeOffset,hole] of poly.slice(1).entries()) {
   // A hole entirely outside its parent is invalid GeoJSON polygon topology.
   // This vertex check is a necessary condition, not a complete ring-crossing audit.
   if(!inRing(hole[0]?.[0],hole[0]?.[1],poly[0])) throw Error('Invalid topology: polygon hole outside outer ring');
   try { assertDisjointRingBoundaries(unwrapRing(poly[0]),unwrapRing(hole)); }
   catch(error) { throw new Error(`Polygon ${polygonIndex} hole ${holeOffset+1}: ${error.message}`,{cause:error}); }
   const holeContains=inRing(lon,lat,hole);
   if(holeContains) inHole=true;
  }
  // GeoJSON holes must be mutually disjoint: overlapping or nested holes
  // make even/odd point containment ambiguous. Check all pairs, not only
  // the hole that happens to contain the query point.
  for(let i=1;i<poly.length;i++) for(let j=i+1;j<poly.length;j++) {
   const a=poly[i],b=poly[j];
   assertDisjointRingBoundaries(unwrapRing(a),unwrapRing(b));
   if(inRing(a[0][0],a[0][1],b)||inRing(b[0][0],b[0][1],a))
    throw Error('Invalid topology: overlapping or nested polygon holes');
  }
  if(outerContains&&!inHole) contained=true;
 }
 // Separate MultiPolygon members must not intersect or contain one another's
 // filled interiors. An island wholly inside another member's hole is valid.
 // Validate boundaries first, then test one outer vertex of each member.
 for(let i=0;i<polygons.length;i++) for(let j=i+1;j<polygons.length;j++) {
  const a=polygons[i],b=polygons[j];
  for(const ringA of a) for(const ringB of b)
   assertDisjointRingBoundaries(unwrapRing(ringA),unwrapRing(ringB));
  const filled=(poly,point)=>inRing(point[0],point[1],poly[0])&&!poly.slice(1).some(h=>inRing(point[0],point[1],h));
  if(filled(a,b[0][0])||filled(b,a[0][0]))
   throw Error('Invalid topology: overlapping MultiPolygon interiors');
 }
 return contained;
}
export function audit(document,selector='USSR') {
 const features=document.type==='FeatureCollection'?document.features:[document];
 const selected=features.filter(f=>f.type==='Feature'&&String(f.properties?.NAME??'').trim().toUpperCase()===selector.trim().toUpperCase());
 if(selected.length!==1) throw Error(`Expected exactly one ${selector} feature, got ${selected.length}`);
 const results=controls.map(p=>({...p,actual:contains(selected[0].geometry,p.lon,p.lat)}));
 return {selectedFeatures:selected.length,controls:results,passed:results.filter(p=>p.actual===p.inside).length,failed:results.filter(p=>p.actual!==p.inside)};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href) {
 const file=process.argv[2];
 if(!file) {console.error('Usage: node postwar-controls.mjs <GeoJSON file> [polity selector]');process.exit(2)}
 try {
  const result=audit(JSON.parse(fs.readFileSync(file,'utf8')),process.argv[3]??'USSR');
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.failed.length?1:0;
 } catch(e) {console.error(e.message);process.exitCode=2}
}
