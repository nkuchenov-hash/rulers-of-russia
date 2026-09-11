import fs from 'node:fs';
import crypto from 'node:crypto';
const file='public/data/territory/archive/russian-empire.geojson';
const bytes=fs.readFileSync(file);
const data=JSON.parse(bytes.toString('utf8'));
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const controls={
  moscow:[37.6173,55.7558],st_petersburg:[30.3351,59.9343],kyiv:[30.5234,50.4501],
  baku:[49.8671,40.4093],derbent:[48.2899,42.0578],tarki:[47.5047,42.9849],
  lankaran:[48.8506,38.7543],rasht:[49.5832,37.2808],lahijan:[50.0039,37.2074],
  sari:[53.0586,36.5659],gorgan:[54.4439,36.8427],tehran:[51.389,35.6892],
  tbilisi:[44.793,41.7151],yerevan:[44.5152,40.1872],kerch:[36.468,45.356],
  astrakhan:[48.0336,46.3479]
};
const rows=[];
for(let index=0;index<(data.features??[]).length;index++){
 const f=data.features[index], p=f.properties??{};
 const start=Number(p.start_date),end=Number(p.end_date);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>1737||end<1727) continue;
 rows.push({index,start,end,properties:p,geometry_sha256:crypto.createHash('sha256').update(JSON.stringify(f.geometry)).digest('hex'),controls:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,contains(v,f.geometry)]))});
}
const out={schema_version:1,archive:file,archive_git_blob_sha1:crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),rows};
fs.writeFileSync('empire-1727-1735-candidates.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));