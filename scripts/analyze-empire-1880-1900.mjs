import fs from 'node:fs';
const years=[1880,1900];
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
function bbox(g){const pts=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else v.forEach(walk)};walk(g?.coordinates);const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return pts.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:null}
const controls={
1880:[['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],['warsaw',[21.0122,52.2297],'inside'],['kyiv',[30.5234,50.4501],'inside'],['tbilisi',[44.793,41.7151],'inside'],['yerevan',[44.5152,40.1872],'inside'],['baku',[49.8671,40.4093],'inside'],['tashkent',[69.2401,41.2995],'inside'],['almaty',[76.886,43.2389],'inside'],['vladivostok',[131.8855,43.1155],'inside'],['yuzhno-sakhalinsk',[142.738,46.9591],'inside'],['berlin',[13.405,52.52],'outside'],['vienna',[16.3738,48.2082],'outside'],['istanbul',[28.9784,41.0082],'outside'],['tehran',[51.389,35.6892],'outside'],['beijing',[116.4074,39.9042],'outside'],['bucharest',[26.1025,44.4268],'outside']],
1900:[['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],['warsaw',[21.0122,52.2297],'inside'],['kyiv',[30.5234,50.4501],'inside'],['tbilisi',[44.793,41.7151],'inside'],['yerevan',[44.5152,40.1872],'inside'],['baku',[49.8671,40.4093],'inside'],['tashkent',[69.2401,41.2995],'inside'],['almaty',[76.886,43.2389],'inside'],['vladivostok',[131.8855,43.1155],'inside'],['yuzhno-sakhalinsk',[142.738,46.9591],'inside'],['berlin',[13.405,52.52],'outside'],['vienna',[16.3738,48.2082],'outside'],['istanbul',[28.9784,41.0082],'outside'],['tehran',[51.389,35.6892],'outside'],['beijing',[116.4074,39.9042],'outside'],['bucharest',[26.1025,44.4268],'outside']]
};
const report={schema_version:1,years:[]};
for(const year of years){
 const d=JSON.parse(fs.readFileSync(`public/data/territory/world-history/snapshots/${year}.geojson`,'utf8'));
 const all=d.features??[];
 const containers={};
 for(const [id,p] of controls[year].filter(x=>x[2]==='inside')){
   containers[id]=all.map((f,i)=>({i,f,p:f.properties??{}})).filter(x=>contains(p,x.f.geometry)).map(x=>({index:x.i,properties:x.p,bbox:bbox(x.f.geometry)}));
 }
 const indices=[...new Set(Object.values(containers).flat().map(x=>x.index))].sort((a,b)=>a-b);
 const selected=indices.map(i=>all[i]);
 const results=controls[year].map(([id,p,e])=>{const inside=selected.some(f=>contains(p,f.geometry));const actual=inside?'inside':'outside';return {id,expected:e,actual,pass:actual===e}});
 report.years.push({year,featureIndices:indices,containers,controls:results,allPass:results.every(x=>x.pass)});
}
fs.writeFileSync('empire-1880-1900-controls.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
