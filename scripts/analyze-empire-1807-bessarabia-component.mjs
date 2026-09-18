import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('public/data/territory/archive/russian-empire.geojson','utf8'));
const feature=(data.features??[]).find(f=>Number(f.properties?.start_date)===1807&&Number(f.properties?.end_date)===1808);
if(!feature) throw new Error('1807-1808 feature not found');
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!==(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function polyContains(pt,p){return !!(p?.length&&ringContains(pt,p[0])&&!p.slice(1).some(h=>ringContains(pt,h)))}
const controls={moscow:[37.6173,55.7558],st_petersburg:[30.3351,59.9343],kyiv:[30.5234,50.4501],chisinau:[28.8353,47.0105],tbilisi:[44.793,41.7151],baku:[49.8671,40.4093],vilnius:[25.2797,54.6872],minsk:[27.5615,53.9045],odessa:[30.7233,46.4825],iasi:[27.6014,47.1585]};
const polys=feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[feature.geometry.coordinates];
const components=polys.map((p,i)=>{
 const ring=p[0]??[]; const xs=ring.map(v=>v[0]), ys=ring.map(v=>v[1]);
 return {index:i,vertexCount:ring.length,bbox:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],controls:Object.fromEntries(Object.entries(controls).map(([k,v])=>[k,polyContains(v,p)]))};
});
const chisinauComponents=components.filter(c=>c.controls.chisinau).map(c=>c.index);
const removable=chisinauComponents.length>0&&chisinauComponents.every(i=>{
 const c=components[i].controls; return !c.moscow&&!c.st_petersburg&&!c.kyiv&&!c.tbilisi&&!c.baku&&!c.vilnius&&!c.minsk;
});
const out={schema_version:1,geometryType:feature.geometry.type,componentCount:components.length,chisinauComponents,removableAsIsolatedComponent:removable,components};
fs.writeFileSync('empire-1807-bessarabia-component.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
