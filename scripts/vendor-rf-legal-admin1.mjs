import fs from 'node:fs';
import crypto from 'node:crypto';

const url='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a/geojson/ne_10m_admin_1_states_provinces.geojson';
const expectedSha256='22d0e3ad85eb3e27f17cabf8ba2d50e554fbc27a87796ff891d958185da62fb5';
const wanted=new Map([
  ['UKR-329','Luhansk'],
  ['UKR-327','Donetsk'],
  ['RUS-283','Crimea'],
  ['UKR-4827','Kherson'],
  ['UKR-331','Zaporizhzhia'],
  ['RUS-5482','Sevastopol'],
]);
const res=await fetch(url,{headers:{'user-agent':'rulers-of-russia-history-core/1.0'}});
if(!res.ok) throw new Error('Natural Earth fetch failed '+res.status);
const bytes=Buffer.from(await res.arrayBuffer());
const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(sha256!==expectedSha256) throw new Error('Natural Earth SHA256 mismatch: '+sha256);
const data=JSON.parse(bytes.toString('utf8'));
const features=(data.features??[]).filter(f=>wanted.has(f.properties?.adm1_code));
if(features.length!==wanted.size) throw new Error('Expected 6 selected features, got '+features.length);
for(const [code,label] of wanted){
  const matches=features.filter(f=>f.properties?.adm1_code===code);
  if(matches.length!==1) throw new Error('Expected one '+label+' feature for '+code+', got '+matches.length);
}
const out={
  type:'FeatureCollection',
  metadata:{
    dataset:'Natural Earth 1:10m admin-1 selected modern RF legal-territory reference',
    upstream:url,
    upstream_sha256:sha256,
    upstream_commit:'ca96624a',
    license:'public domain',
    selection:[...wanted.keys()]
  },
  features
};
const outPath='public/data/territory/cultural/rf_legal_admin1_selected_10m.geojson';
fs.mkdirSync('public/data/territory/cultural',{recursive:true});
fs.writeFileSync(outPath,JSON.stringify(out,null,2)+'\n');
console.log('Wrote',outPath,features.map(f=>[f.properties.adm1_code,f.properties.name_en,f.properties.admin]));
