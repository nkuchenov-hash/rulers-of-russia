import fs from 'node:fs';
import crypto from 'node:crypto';
const dir='public/data/territory/world-history/snapshots';
if(!fs.existsSync(dir)) throw new Error('world-history snapshots missing');
const names=fs.readdirSync(dir).filter(x=>x.endsWith('.geojson')).sort((a,b)=>Number(a)-Number(b));
function blobSha(bytes){const prefix=Buffer.from(`blob ${bytes.length}\0`);return crypto.createHash('sha1').update(prefix).update(bytes).digest('hex')}
for(const name of names){
 const year=Number(name.replace('.geojson','')); if(![1200,1230,1250,1300,1600,1700,1800,1900,1920,1930,1940,1950].some(y=>Math.abs(year-y)<=25)) continue;
 const file=`${dir}/${name}`; const bytes=fs.readFileSync(file); const data=JSON.parse(bytes.toString('utf8'));
 const rows=(data.features??[]).map((f,i)=>({i,p:f.properties??{}})).filter(x=>/russ|soviet|mosc|vladimir|suzdal|kievan|rus\b|bolshev/i.test(JSON.stringify(x.p)));
 console.log(`WORLD ${year} file=${file} sha1=${blobSha(bytes)} matches=${rows.length}`);
 for(const row of rows) console.log(JSON.stringify({year,index:row.i,properties:row.p}));
}
