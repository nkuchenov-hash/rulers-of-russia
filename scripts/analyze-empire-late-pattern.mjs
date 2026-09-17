import fs from 'node:fs';
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
const d=JSON.parse(fs.readFileSync('public/data/territory/archive/russian-empire.geojson','utf8'));
const common=(year)=>[
['moscow',[37.6173,55.7558],'inside'],['st-petersburg',[30.3351,59.9343],'inside'],['helsinki',[24.9384,60.1699],'inside'],
['warsaw',[21.0122,52.2297],year>=1815?'inside':'outside'],['vilnius',[25.2797,54.6872],'inside'],['chisinau',[28.8353,47.0105],'inside'],
['tbilisi',[44.793,41.7151],'inside'],['baku',[49.8671,40.4093],'inside'],['yerevan',[44.5152,40.1872],year>=1828?'inside':'outside'],
['bucharest',[26.1025,44.4268],'outside'],['tehran',[51.389,35.6892],'outside'],['istanbul',[28.9784,41.0082],'outside'],
['vladivostok',[131.8855,43.1155],year>=1860?'inside':'outside'],['sitka',[-135.33,57.05],year<1867?'inside':'outside'],
['tashkent',[69.2401,41.2995],year>=1865?'inside':'outside'],['samarkand',[66.9597,39.6542],year>=1868?'inside':'outside'],
['fergana',[71.786,40.386],year>=1876?'inside':'outside'],
['north-sakhalin',[142.7,51.2],'inside'],['south-sakhalin',[142.738,46.9591],year>=1875&&year<1905?'inside':'outside'],
['iturup',[147.45,45.0],year<1875?'inside':'outside']
];
const specs=[[1828,33],[1834,35],[1840,37],[1856,42],[1860,45],[1868,49],[1873,52],[1877,53],[1885,55],[1895,56],[1900,58],[1905,59]];
const report={schema_version:1,profiles:{}};
for(const [year,index] of specs){const f=d.features[index], controls=common(year); const r=controls.map(([id,ll,e])=>{const a=contains(ll,f.geometry)?'inside':'outside';return{id,expected:e,actual:a,pass:a===e}});report.profiles[year]={index,start:f.properties.start_date,end:f.properties.end_date,failed:r.filter(x=>!x.pass),allPass:r.every(x=>x.pass)}}
fs.writeFileSync('empire-late-pattern-controls.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));