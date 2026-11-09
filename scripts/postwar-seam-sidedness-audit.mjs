// Read-only local planar sidedness diagnostic, not historical verification.
import fs from 'node:fs';
import {inspectSeam} from './postwar-seam-audit.mjs';
function unwrap(ring){
 const out=[];
 for(const [lon,lat] of ring){let x=lon;if(out.length)x+=360*Math.round((out.at(-1)[0]-x)/360);out.push([x,lat]);}
 if(Math.abs(out[0][0]-out.at(-1)[0])>1e-8)throw Error('Unsupported winding ring');
 return out;
}
function inside(ring,x,y){
 let hit=false;
 for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}
 return hit;
}
function filled(poly,lon,lat){
 const outer=unwrap(poly[0]);let min=Infinity,max=-Infinity;
 for(const [x] of outer){min=Math.min(min,x);max=Math.max(max,x);}
 const x=lon+360*Math.round(((min+max)/2-lon)/360);
 if(!inside(outer,x,lat))return false;
 return !poly.slice(1).some(raw=>{const hole=unwrap(raw);return [-360,0,360].some(shift=>inside(hole,x+shift,lat));});
}
export function auditSeamSidedness(doc,name='USSR',delta=0.0001){
 if(!(delta>0&&delta<0.1))throw Error('Invalid sample offset');
 const evidence=inspectSeam(doc,name);
 const features=doc.type==='FeatureCollection'?doc.features:[doc];
 const selected=features.filter(f=>f.type==='Feature'&&String(f.properties?.NAME??'').trim().toUpperCase()===name.toUpperCase());
 const g=selected[0].geometry,polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
 const samples=evidence.seamEdgeOverlaps.map(({a,b,latitudeInterval})=>{
  const latitude=(latitudeInterval[0]+latitudeInterval[1])/2;
  const sides=[a[0],b[0]].map(component=>({component,west:filled(polygons[component],180-delta,latitude),east:filled(polygons[component],-180+delta,latitude)}));
  const west=sides.filter(s=>s.west).length,east=sides.filter(s=>s.east).length;
  return {edges:[a,b],latitudeInterval,latitude,sides,classification:west>1||east>1?'same-side-overlap':west===1&&east===1?'opposite-side-contact':'inconclusive'};
 });
 return {name,delta,samples,summary:Object.fromEntries(['opposite-side-contact','same-side-overlap','inconclusive'].map(k=>[k,samples.filter(s=>s.classification===k).length])),limitations:'Sparse local planar samples, not proof of global topology or historical accuracy.'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 try{const doc=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(auditSeamSidedness(doc,process.argv[3]??'USSR'),null,2));}
 catch(e){console.error(e.message);process.exitCode=2;}
}
