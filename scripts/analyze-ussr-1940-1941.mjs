import fs from 'node:fs';
function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function poly(p,pp){return Boolean(pp?.length&&ringContains(p,pp[0])&&!pp.slice(1).some(h=>ringContains(p,h)))}
function contains(p,g){if(g?.type==='Polygon')return poly(p,g.coordinates);if(g?.type==='MultiPolygon')return g.coordinates.some(x=>poly(p,x));return false}
const controls=[
['moscow',[37.6173,55.7558],'inside'],['kyiv',[30.5234,50.4501],'inside'],['minsk',[27.5615,53.9045],'inside'],['tbilisi',[44.793,41.7151],'inside'],['yerevan',[44.5152,40.1872],'inside'],['baku',[49.8671,40.4093],'inside'],['tashkent',[69.2401,41.2995],'inside'],['almaty',[76.886,43.2389],'inside'],['vilnius',[25.2797,54.6872],'inside'],['riga',[24.1052,56.9496],'inside'],['tallinn',[24.7536,59.437],'inside'],['chisinau',[28.8353,47.0105],'inside'],['vladivostok',[131.8855,43.1155],'inside'],
['kaliningrad',[20.4522,54.7104],'outside'],['yuzhno-sakhalinsk',[142.738,46.9591],'outside'],['helsinki',[24.9384,60.1699],'outside'],['warsaw',[21.0122,52.2297],'outside'],['kabul',[69.2075,34.5553],'outside'],['tehran',[51.389,35.6892],'outside'],['beijing',[116.4074,39.9042],'outside'],['ankara',[32.8597,39.9334],'outside']
];
const d=JSON.parse(fs.readFileSync('public/data/territory/archive/ussr.geojson','utf8'));
const report={schema_version:1,features:[6,7].map(index=>{const f=d.features[index];const results=controls.map(([id,p,e])=>{const actual=contains(p,f.geometry)?'inside':'outside';return{id,expected:e,actual,pass:actual===e}});return{index,properties:f.properties,allPass:results.every(x=>x.pass),controls:results}})};
fs.writeFileSync('ussr-1940-1941-controls.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));