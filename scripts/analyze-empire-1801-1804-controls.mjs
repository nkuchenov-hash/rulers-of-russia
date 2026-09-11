import fs from 'node:fs'; import crypto from 'node:crypto';
const file='public/data/territory/archive/russian-empire.geojson'; const bytes=fs.readFileSync(file); const data=JSON.parse(bytes.toString('utf8'));
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const controls={
 moscow:[37.6173,55.7558],kyiv:[30.5234,50.4501],vilnius:[25.2797,54.6872],minsk:[27.5615,53.9045],crimea:[33.857,44.75],
 tbilisi:[44.793,41.7151],mtskheta:[44.718,41.845],telavi:[45.477,41.919],gori:[44.114,41.984],
 kutaisi:[42.7048,42.2679],batumi:[41.6367,41.6168],sukhumi:[41.015,43.0015],gagra:[40.267,43.278],
 ganja:[46.3606,40.6828],sheki:[47.1706,41.1919],baku:[49.8671,40.4093],yerevan:[44.5152,40.1872],
 chisinau:[28.8353,47.0105],helsinki:[24.9384,60.1699],warsaw:[21.0122,52.2297]
};
const rows=(data.features??[]).map((f,index)=>({index,p:f.properties??{},g:f.geometry})).filter(x=>Number(x.p.start_date)<=1804&&Number(x.p.end_date)>=1799).map(x=>({
 index:x.index,start:x.p.start_date,end:x.p.end_date,props:x.p,sha:crypto.createHash('sha256').update(JSON.stringify(x.g)).digest('hex'),
 controls:Object.fromEntries(Object.entries(controls).map(([k,p])=>[k,contains(p,x.g)]))
}));
const out={archive:file,blobSha1:crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),rows};
fs.writeFileSync('empire-1801-1804-controls.json',JSON.stringify(out,null,2)+'\n'); console.log(JSON.stringify(out,null,2));