import fs from 'node:fs';
const years=[1783,1800,1815,1880,1900,1914];
function bbox(g){const pts=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else for(const c of v)walk(c)};walk(g?.coordinates);if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(v=>Math.round(v*1e5)/1e5)}
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
const controls1914=[
['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],['warsaw',[21.0122,52.2297],'inside'],['kyiv',[30.5234,50.4501],'inside'],['tbilisi',[44.793,41.7151],'inside'],['yerevan',[44.5152,40.1872],'inside'],['baku',[49.8671,40.4093],'inside'],['tashkent',[69.2401,41.2995],'inside'],['almaty',[76.886,43.2389],'inside'],['vladivostok',[131.8855,43.1155],'inside'],['north-sakhalin',[142.7,51.2],'inside'],
['berlin',[13.405,52.52],'outside'],['vienna',[16.3738,48.2082],'outside'],['istanbul',[28.9784,41.0082],'outside'],['tehran',[51.389,35.6892],'outside'],['beijing',[116.4074,39.9042],'outside'],['stockholm',[18.0686,59.3293],'outside'],['bucharest',[26.1025,44.4268],'outside'],['south-sakhalin',[142.738,46.9591],'outside']
];
function unionContains(point,features){return features.some(f=>contains(point,f.geometry))}
const report={schema_version:2,years:[]};
for(const year of years){
 const file=`public/data/territory/world-history/snapshots/${year}.geojson`;
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 const candidates=(d.features??[]).map((f,i)=>({i,f,p:f.properties??{}})).filter(x=>Object.values(x.p).some(v=>/russi|rossi|росси/i.test(String(v))));
 const russianSubject=(d.features??[]).map((f,i)=>({i,f,p:f.properties??{}})).filter(x=>String(x.p.SUBJECTO??'')==='Russia'||String(x.p.PARTOF??'')==='Russian Empire'||String(x.p.NAME??'')==='Russian Empire'||String(x.p.NAME??'')==='Sakhalin (RU)');
 const aggregateControls=year===1914?controls1914.map(([id,p,e])=>{const a=unionContains(p,russianSubject.map(x=>x.f))?'inside':'outside';return {id,expected:e,actual:a,pass:a===e}}):null;
 const failedPointContainers=year===1914?controls1914.filter(([,p,e])=>e==='inside').map(([id,p])=>({id,containers:(d.features??[]).map((f,i)=>({i,f,p:f.properties??{}})).filter(x=>contains(p,x.f.geometry)).map(x=>({index:x.i,properties:x.p,bbox:bbox(x.f.geometry)}))})):null;
 report.years.push({year,candidates:candidates.map(x=>({index:x.i,properties:x.p,geometry_type:x.f.geometry?.type,bbox:bbox(x.f.geometry),controls:year===1914?controls1914.map(([id,p,e])=>{const a=contains(p,x.f.geometry)?'inside':'outside';return {id,expected:e,actual:a,pass:a===e}}):null})),russianSubjectAggregate:{featureIndices:russianSubject.map(x=>x.i),featureProperties:russianSubject.map(x=>x.p),controls:aggregateControls,allPass:aggregateControls?aggregateControls.every(x=>x.pass):null},failedPointContainers});
}
fs.writeFileSync('empire-world-snapshot-candidates.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));