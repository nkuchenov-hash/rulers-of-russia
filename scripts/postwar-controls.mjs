#!/usr/bin/env node
// Diagnostic only: point containment does not establish historical border accuracy.
import fs from 'node:fs';

export const controls = Object.freeze([
  {name:'Moscow', lon:37.6173, lat:55.7558, inside:true},
  {name:'Kyiv', lon:30.5234, lat:50.4501, inside:true},
  {name:'Vilnius', lon:25.2797, lat:54.6872, inside:true},
  {name:'Kaliningrad', lon:20.4522, lat:54.7104, inside:true},
  {name:'Yuzhno-Sakhalinsk', lon:142.7380, lat:46.9591, inside:true},
  {name:'Vladivostok', lon:131.8855, lat:43.1155, inside:true},
  {name:'Warsaw', lon:21.0122, lat:52.2297, inside:false},
  {name:'Helsinki', lon:24.9384, lat:60.1699, inside:false},
]);

function onSegment(x,y,a,b) {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  return Math.abs((x-a[0])*dy-(y-a[1])*dx)<=1e-10 &&
    (x-a[0])*(x-b[0])<=1e-10 && (y-a[1])*(y-b[1])<=1e-10;
}
function inRing(lon,lat,ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[j],b=ring[i];
    if(onSegment(lon,lat,a,b)) return true;
    if((a[1]>lat)!==(b[1]>lat) && lon<(b[0]-a[0])*(lat-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
  }
  return inside;
}
export function contains(geometry,lon,lat) {
  if(!geometry || !['Polygon','MultiPolygon'].includes(geometry.type)) throw Error('Expected Polygon/MultiPolygon');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(poly => inRing(lon,lat,poly[0]) && !poly.slice(1).some(hole=>inRing(lon,lat,hole)));
}
export function audit(document,selector='USSR') {
  const features=document.type==='FeatureCollection'?document.features:[document];
  const selected=features.filter(f=>f.type==='Feature' && Object.values(f.properties??{}).some(v=>String(v).toUpperCase()===selector.toUpperCase()));
  if(selected.length!==1) throw Error(`Expected exactly one ${selector} feature, got ${selected.length}`);
  const results=controls.map(p=>({...p,actual:contains(selected[0].geometry,p.lon,p.lat)}));
  return {selectedFeatures:selected.length,controls:results,passed:results.filter(p=>p.actual===p.inside).length,failed:results.filter(p=>p.actual!==p.inside)};
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href) {
  const file=process.argv[2];
  if(!file) {console.error('Usage: node postwar-controls.mjs <GeoJSON file> [polity selector]');process.exit(2)}
  try {
    const result=audit(JSON.parse(fs.readFileSync(file,'utf8')),process.argv[3]??'USSR');
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.failed.length?1:0;
  } catch(e) {console.error(e.message);process.exitCode=2}
}
