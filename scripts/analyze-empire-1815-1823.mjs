import fs from 'node:fs';
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
const controls=[['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],['warsaw',[21.0122,52.2297],'inside'],['vilnius',[25.2797,54.6872],'inside'],['minsk',[27.5615,53.9045],'inside'],['kyiv',[30.5234,50.4501],'inside'],['chisinau',[28.8353,47.0105],'inside'],['bakhchysarai',[33.857,44.75],'inside'],['tbilisi',[44.793,41.7151],'inside'],['baku',[49.8671,40.4093],'inside'],['yerevan',[44.5152,40.1872],'outside'],['bucharest',[26.1025,44.4268],'outside'],['tehran',[51.389,35.6892],'outside'],['istanbul',[28.9784,41.0082],'outside']];
const ts=JSON.parse(fs.readFileSync('public/data/territory/archive/russian-empire.geojson','utf8')).features[31];
const w=JSON.parse(fs.readFileSync('public/data/territory/world-history/snapshots/1815.geojson','utf8'));
const world=[408,428].map(i=>w.features[i]);
const run=(geoms)=>controls.map(([id,p,e])=>{const actual=geoms.some(g=>contains(p,g))?'inside':'outside';return{id,expected:e,actual,pass:actual===e}});
const main=run([ts.geometry]); const worldr=run(world.map(f=>f.geometry));
const report={schema_version:1,cliopatria:{index:31,start:ts.properties.start_date,end:ts.properties.end_date,controls:main,allPass:main.every(x=>x.pass)},world1815:{featureIndices:[408,428],controls:worldr,allPass:worldr.every(x=>x.pass)}};
fs.writeFileSync('empire-1815-1823-controls.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));