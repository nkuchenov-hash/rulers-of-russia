import crypto from 'node:crypto';
import fs from 'node:fs';

const file='public/data/territory/archive/russian-empire.geojson';
const bytes=fs.readFileSync(file); const payload=JSON.parse(bytes.toString('utf8'));
const blobSha1=crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const controls=[['moscow',[37.6173,55.7558]],['warsaw',[21.0122,52.2297]],['chisinau',[28.8353,47.0105]],['kars',[43.0975,40.6013]],['batumi',[41.6367,41.6168]],['tashkent',[69.2401,41.2995]],['samarkand',[66.9597,39.6542]],['fergana',[71.786,40.386]],['khiva',[60.3639,41.3783]],['vladivostok',[131.8855,43.1155]],['south_sakhalin',[142.738,46.9591]],['urup',[150.1,45.9]],['sitka',[-135.33,57.05]],['helsinki',[24.9384,60.1699]]];
const rows=(payload.features??[]).map((f,index)=>({index,start:f.properties?.start_date,end:f.properties?.end_date,properties:f.properties,geometry_sha256:crypto.createHash('sha256').update(JSON.stringify(f.geometry)).digest('hex'),controls:Object.fromEntries(controls.map(([id,p])=>[id,contains(p,f.geometry)]))})).filter(r=>r.end>=1873&&r.start<=1879);
const report={schema_version:1,archive:file,archive_git_blob_sha1:blobSha1,rows}; fs.writeFileSync('empire-1873-1879.json',JSON.stringify(report,null,2)+'\n'); console.log(JSON.stringify(report,null,2));