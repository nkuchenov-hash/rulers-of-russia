const layer = '37313';
const lon = 30.81765278;
const lat = 69.79483889;
const size = 5000;
const R = 6378137;
const x = R * lon * Math.PI / 180;
const y = R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
const bbox = [x - size / 2, y - size / 2, x + size / 2, y + size / 2].join(',');
const url = new URL(`https://nspd.gov.ru/api/aeggis/v3/${layer}/wms`);
for (const [k,v] of Object.entries({
  REQUEST:'GetFeatureInfo', QUERY_LAYERS:layer, SERVICE:'WMS', VERSION:'1.3.0',
  FORMAT:'image/png', STYLES:'', TRANSPARENT:'true', LAYERS:layer,
  INFO_FORMAT:'application/json', FEATURE_COUNT:'10', I:'256', J:'256', WIDTH:'512', HEIGHT:'512',
  CRS:'EPSG:3857', BBOX:bbox
})) url.searchParams.set(k,v);
const response = await fetch(url, {headers:{
  'user-agent':'Mozilla/5.0 (History Core NSPD provenance probe)',
  'referer':`https://nspd.gov.ru/map?thematic=Default&active_layers=${layer}`,
  'accept':'application/json,*/*'
}});
console.log('STATUS', response.status, response.headers.get('content-type'));
const text = await response.text();
console.log('BODY_LEN', text.length);
console.log(text.slice(0, 20000));
if (!response.ok) process.exit(2);
let payload;
try { payload = JSON.parse(text); } catch { process.exit(3); }
const features = payload?.data?.features ?? payload?.features ?? [];
console.log('FEATURE_COUNT', features.length);
for (const feature of features) {
  const geometry = feature?.geometry ?? feature?.data?.geometry;
  console.log('FEATURE', feature?.id ?? null, geometry?.type ?? null, JSON.stringify(geometry?.coordinates ?? null).length);
}
