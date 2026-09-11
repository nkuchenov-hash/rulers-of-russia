import fs from 'node:fs';
import crypto from 'node:crypto';
const url='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a/geojson/ne_10m_admin_1_states_provinces.geojson';
const res=await fetch(url,{headers:{'user-agent':'rulers-of-russia-history-core/1.0'}});
if(!res.ok) throw new Error(`fetch failed ${res.status}`);
const bytes=Buffer.from(await res.arrayBuffer());
const data=JSON.parse(bytes.toString('utf8'));
const needles=['crimea','sevastopol','donetsk','luhansk','lugansk','zaporiz','zaporoz','kherson'];
const matches=(data.features??[]).map((f,index)=>({index,properties:f.properties??{},geometry:f.geometry})).filter(row=>{
 const hay=JSON.stringify(row.properties).toLowerCase();
 return needles.some(n=>hay.includes(n));
});
const slim=matches.map(row=>({index:row.index,properties:row.properties,geometryType:row.geometry?.type,geometrySha256:crypto.createHash('sha256').update(JSON.stringify(row.geometry)).digest('hex')}));
const selected={type:'FeatureCollection',metadata:{source_url:url,source_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source_bytes:bytes.length,selected_by_keywords:needles},features:matches.map(r=>({type:'Feature',properties:r.properties,geometry:r.geometry}))};
fs.writeFileSync('rf-admin1-candidates.json',JSON.stringify({source:url,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),matches:slim},null,2)+'\n');
fs.writeFileSync('rf-admin1-selected.geojson',JSON.stringify(selected)+'\n');
console.log(JSON.stringify({bytes:bytes.length,count:matches.length,matches:slim},null,2));