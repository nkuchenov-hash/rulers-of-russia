import crypto from 'node:crypto';
import fs from 'node:fs';

const file = 'public/data/territory/archive/russian-federation.geojson';
const bytes = fs.readFileSync(file);
const payload = JSON.parse(bytes.toString('utf8'));
const blobSha1 = crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
function bbox(g){const pts=[];const w=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))pts.push(v);else v.forEach(w)};w(g?.coordinates);if(!pts.length)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(x=>Math.round(x*1e5)/1e5)}
function count(g){let n=0;const w=v=>{if(!Array.isArray(v))return;if(v.length>=2&&Number.isFinite(v[0])&&Number.isFinite(v[1]))n++;else v.forEach(w)};w(g?.coordinates);return n}
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function contains(pt,g){const poly=p=>p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h));return g?.type==='Polygon'?!!poly(g.coordinates):g?.type==='MultiPolygon'?g.coordinates.some(poly):false}
const controls=[['moscow',[37.6173,55.7558]],['simferopol',[34.1003,44.9521]],['sevastopol',[33.5254,44.6166]],['donetsk',[37.8028,48.0159]],['luhansk',[39.3078,48.5740]],['zaporizhzhia',[35.1396,47.8388]],['kherson',[32.6178,46.6354]],['kyiv',[30.5234,50.4501]],['minsk',[27.5615,53.9045]],['tbilisi',[44.793,41.7151]],['astana',[71.4304,51.1282]]];
const rows=(payload.features??[]).map((f,index)=>({index,properties:f.properties??{},bbox:bbox(f.geometry),coordinate_count:count(f.geometry),geometry_sha256:crypto.createHash('sha256').update(JSON.stringify(f.geometry)).digest('hex'),control_membership:Object.fromEntries(controls.map(([id,pt])=>[id,contains(pt,f.geometry)]))}));
const ids=[...new Set(rows.map(r=>r.properties?.provenance?.capture_id).filter(Number.isInteger))];
async function meta(id){const url=`https://api.openhistoricalmap.org/api/0.6/relation/${id}`;try{const res=await fetch(url,{headers:{'user-agent':'rulers-of-russia-history-core-research/1.0'}});const xml=await res.text();const tag=xml.match(/<relation\b[^>]*>/)?.[0]??'';const a=n=>tag.match(new RegExp(`\\b${n}="([^"]*)"`))?.[1]??null;return{id,url,ok:res.ok,status:res.status,version:a('version'),changeset:a('changeset'),timestamp:a('timestamp'),visible:a('visible'),explicit_license_tags:[...xml.matchAll(/<tag\s+k="license"\s+v="([^"]+)"\s*\/>/g)].map(m=>m[1])}}catch(e){return{id,url,ok:false,error:String(e)}}}
const report={schema_version:1,archive:file,archive_git_blob_sha1:blobSha1,feature_count:rows.length,relation_metadata:await Promise.all(ids.map(meta)),candidates:rows};
fs.writeFileSync('rf-archive-candidates.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
