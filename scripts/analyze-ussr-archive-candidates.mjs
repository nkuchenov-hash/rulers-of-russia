import crypto from 'node:crypto';
import fs from 'node:fs';

const file = 'public/data/territory/archive/ussr.geojson';
const bytes = fs.readFileSync(file);
const payload = JSON.parse(bytes.toString('utf8'));
const blobSha1 = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

function bbox(g){const pts=[];const w=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else v.forEach(w)};w(g?.coordinates);if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(x=>Math.round(x*1e5)/1e5)}
function count(g){let n=0;const w=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))n++;else v.forEach(w)};w(g?.coordinates);return n}
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const controls=[
  ['moscow',[37.6173,55.7558]],['kyiv',[30.5234,50.4501]],['minsk',[27.5615,53.9045]],['tbilisi',[44.793,41.7151]],
  ['lviv',[24.0316,49.8429]],['belz',[24.0060,50.3823]],['chervonohrad',[24.2290,50.3910]],['ustrzyki_dolne',[22.5947,49.4303]],
  ['vilnius',[25.2797,54.6872]],['chisinau',[28.8353,47.0105]],['vladivostok',[131.8855,43.1155]],['yuzhno_sakhalinsk',[142.7380,46.9591]]
];
const rows=(payload.features??[]).map((f,index)=>({index,properties:f.properties??{},bbox:bbox(f.geometry),coordinate_count:count(f.geometry),geometry_sha256:crypto.createHash('sha256').update(JSON.stringify(f.geometry)).digest('hex'),control_membership:Object.fromEntries(controls.map(([id,pt])=>[id,contains(pt,f.geometry)]))}));
const report={schema_version:1,archive:file,archive_git_blob_sha1:blobSha1,feature_count:rows.length,candidates:rows};
fs.writeFileSync('ussr-archive-candidates.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));