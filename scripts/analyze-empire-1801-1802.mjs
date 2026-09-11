import fs from 'node:fs';
import crypto from 'node:crypto';
const file='public/data/territory/archive/russian-empire.geojson';
const bytes=fs.readFileSync(file); const data=JSON.parse(bytes.toString('utf8'));
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const f=(data.features??[]).find(x=>String(x.properties?.start_date)==='1803'&&String(x.properties?.end_date)==='1804');
if(!f) throw new Error('1803-1804 feature missing');
const controls={
  tbilisi:[44.793,41.7151],telavi:[45.473,41.9198],gori:[44.1086,41.9842],sighnaghi:[45.921,41.618],
  kutaisi:[42.7048,42.2679],poti:[41.671,42.146],zugdidi:[41.8709,42.5088],ozurgeti:[42.0068,41.9244],
  batumi:[41.6367,41.6168],baku:[49.8671,40.4093],yerevan:[44.5152,40.1872]
};
const report={schema_version:1,archive:file,archive_git_blob_sha1:crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),properties:f.properties,geometry_sha256:crypto.createHash('sha256').update(JSON.stringify(f.geometry)).digest('hex'),controls:Object.fromEntries(Object.entries(controls).map(([id,p])=>[id,contains(p,f.geometry)]))};
fs.writeFileSync('empire-1801-1802-diagnostic.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));