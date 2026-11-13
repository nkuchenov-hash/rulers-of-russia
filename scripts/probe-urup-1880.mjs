import fs from 'node:fs';
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
function bbox(g){const pts=[];const walk=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else v.forEach(walk)};walk(g?.coordinates);if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]}
const d=JSON.parse(fs.readFileSync('public/data/territory/world-history/snapshots/1880.geojson','utf8'));
const points={urup:[150.1,45.9],iturup:[147.45,45.0],paramushir:[155.6,50.4],shumshu:[156.3,50.75]};
const containers={};
for(const [id,p] of Object.entries(points)) containers[id]=(d.features??[]).map((f,i)=>({i,p:f.properties??{},g:f.geometry})).filter(x=>contains(p,x.g)).map(x=>({index:x.i,properties:x.p,bbox:bbox(x.g),geometryType:x.g?.type}));
const report={schema_version:1,containers};
fs.writeFileSync('urup-1880-probe.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));