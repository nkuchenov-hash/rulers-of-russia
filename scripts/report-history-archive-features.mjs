import fs from 'node:fs';
import crypto from 'node:crypto';

const files = [
  'public/data/territory/archive/kievan-rus.geojson',
  'public/data/territory/archive/grand-vladimir.geojson',
  'public/data/territory/archive/grand-moscow.geojson',
  'public/data/territory/archive/russian-tsardom.geojson',
  'public/data/territory/archive/russian-empire.geojson',
  'public/data/territory/archive/russian-republic.geojson',
  'public/data/territory/archive/ussr.geojson',
];
function blobSha(bytes){const prefix=Buffer.from(`blob ${bytes.length}\0`);return crypto.createHash('sha1').update(prefix).update(bytes).digest('hex')}
for(const file of files){
  const bytes=fs.readFileSync(file); const data=JSON.parse(bytes.toString('utf8'));
  console.log(`ARCHIVE ${file} sha1=${blobSha(bytes)} features=${data.features?.length??0}`);
  (data.features??[]).forEach((f,i)=>{
    const p=f.properties??{};
    console.log(JSON.stringify({file,index:i,start:p.start_date??null,end:p.end_date??null,status:p.status??null,confidence:p.confidence??null,name:p.name??null,area:p.provenance?.source_area_km2??null}));
  });
}
