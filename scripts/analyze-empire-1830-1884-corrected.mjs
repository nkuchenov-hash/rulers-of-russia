import fs from 'node:fs';
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
const d=JSON.parse(fs.readFileSync('public/data/territory/archive/russian-empire.geojson','utf8'));
function controls(start,end){
 const c=[
 ['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],
 ['warsaw',[21.0122,52.2297],'inside'],['vilnius',[25.2797,54.6872],'inside'],['chisinau',[28.8353,47.0105],'inside'],
 ['tbilisi',[44.793,41.7151],'inside'],['yerevan',[44.5152,40.1872],'inside'],['baku',[49.8671,40.4093],'inside'],
 ['bucharest',[26.1025,44.4268],'outside'],['tehran',[51.389,35.6892],'outside'],['istanbul',[28.9784,41.0082],'outside']
 ];
 c.push(['vladivostok',[131.8855,43.1155],start>=1860?'inside':'outside']);
 if(end<1867)c.push(['sitka',[-135.33,57.05],'inside']); else if(start>=1868)c.push(['sitka',[-135.33,57.05],'outside']);
 c.push(['tashkent',[69.2401,41.2995],start>=1865?'inside':'outside']);
 c.push(['samarkand',[66.9597,39.6542],start>=1868?'inside':'outside']);
 c.push(['fergana',[71.786,40.386],start>=1876?'inside':'outside']);
 if(start>=1855 && end<=1874){c.push(['urup',[150.1,45.9],'inside']);c.push(['iturup',[147.45,45.0],'outside']);}
 if(start>=1877){c.push(['south-sakhalin',[142.738,46.9591],'inside']);c.push(['urup',[150.1,45.9],'outside']);}
 return c;
}
const report={schema_version:1,profiles:{}};
for(let index=34;index<=54;index++){
 const f=d.features[index],start=Number(f.properties.start_date),end=Number(f.properties.end_date),cc=controls(start,end);
 const rr=cc.map(([id,ll,e])=>{const a=contains(ll,f.geometry)?'inside':'outside';return{id,expected:e,actual:a,pass:a===e}});
 report.profiles[String(start)+'-'+String(end)]={index,start,end,failed:rr.filter(x=>!x.pass),allPass:rr.every(x=>x.pass)};
}
fs.writeFileSync('empire-1830-1884-corrected-controls.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));