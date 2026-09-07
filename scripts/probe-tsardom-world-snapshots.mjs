import fs from 'node:fs';

function ringContains([x,y],ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if(((yi>y)!=(yj>y))&&x<((xj-xi)*(y-yi))/((yj-yi)||Number.EPSILON)+xi)inside=!inside}return inside}
function polygonContains(point,polygon){return Boolean(polygon?.length&&ringContains(point,polygon[0])&&!polygon.slice(1).some(hole=>ringContains(point,hole)))}
function contains(point,geometry){if(geometry?.type==='Polygon')return polygonContains(point,geometry.coordinates);if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(p=>polygonContains(point,p));return false}

const years=[1600,1650,1700,1715];
const controls={
  moscow:[37.6173,55.7558],
  kazan:[49.1064,55.7961],
  astrakhan:[48.0336,46.3479],
  smolensk:[32.0453,54.7826],
  kyiv:[30.5234,50.4501],
  azov:[39.4233,47.1121],
  arkhangelsk:[40.5433,64.5393],
  tobolsk:[68.2538,58.1981],
  baku:[49.8671,40.4093],
  warsaw:[21.0122,52.2297],
  stockholm:[18.0686,59.3293],
  istanbul:[28.9784,41.0082]
};

const rows=[];
for(const year of years){
  const file=`public/data/territory/world-history/snapshots/${year}.geojson`;
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const candidates=(data.features??[])
    .map((feature,index)=>({feature,index}))
    .filter(({feature})=>contains(controls.moscow,feature.geometry));
  rows.push({
    year,
    file,
    candidateCount:candidates.length,
    candidates:candidates.map(({feature,index})=>({
      index,
      properties:feature.properties??{},
      controls:Object.fromEntries(Object.entries(controls).map(([id,point])=>[id,contains(point,feature.geometry)]))
    }))
  });
}
const out={schema_version:1,generatedAt:new Date().toISOString(),rows};
fs.writeFileSync('tsardom-world-snapshot-probe.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
