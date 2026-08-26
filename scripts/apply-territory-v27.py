from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
renderer = ROOT / 'src/app/territory/HistoricalTerritoryGlobeWebGLV21.jsx'
s = renderer.read_text()

old_build = "function buildPolygonSegments(features,radius=1.0002){const pos=[];for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;const step=Math.max(1,Math.ceil(ring.length/1800));for(let i=0;i<ring.length-1;i+=step){const a=ring[i],b=ring[Math.min(i+step,ring.length-1)];if(!a||!b)continue;const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);pos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)}}return pos}"
new_build = r'''function canonicalSegmentKey(a,b){const q=p=>`${Math.round(Number(p[0])*1e5)},${Math.round(Number(p[1])*1e5)}`,ka=q(a),kb=q(b);return ka<kb?`${ka}|${kb}`:`${kb}|${ka}`}
function boundaryGrid(features,cell=.5){const map=new Map(),segments=[];const put=(x,y,index)=>{const k=`${x},${y}`;let list=map.get(k);if(!list){list=[];map.set(k,list)}list.push(index)};for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];if(!a||!b)continue;let x1=Number(a[0]),x2=Number(b[0]);const y1=Number(a[1]),y2=Number(b[1]);if(![x1,x2,y1,y2].every(Number.isFinite))continue;if(x2-x1>180)x2-=360;else if(x2-x1<-180)x2+=360;const index=segments.length;segments.push([x1,y1,x2,y2]);const minX=Math.floor((Math.min(x1,x2)-.42)/cell),maxX=Math.floor((Math.max(x1,x2)+.42)/cell),minY=Math.floor((Math.min(y1,y2)-.42)/cell),maxY=Math.floor((Math.max(y1,y2)+.42)/cell);for(let gx=minX;gx<=maxX;gx++)for(let gy=minY;gy<=maxY;gy++)put(gx,gy,index)}}return{map,segments,cell}}
function pointSegmentDistance(lon,lat,seg){let[x1,y1,x2,y2]=seg;while(lon-x1>180)lon-=360;while(lon-x1<-180)lon+=360;const cos=Math.max(.2,Math.cos(lat*Math.PI/180)),dx=(x2-x1)*cos,dy=y2-y1,px=(lon-x1)*cos,py=lat-y1,len2=dx*dx+dy*dy;if(len2<=1e-12)return Math.hypot(px,py);const t=Math.max(0,Math.min(1,(px*dx+py*dy)/len2));return Math.hypot(px-t*dx,py-t*dy)}
function nearBoundary(lon,lat,grid,threshold=.32){if(!grid)return false;const gx=Math.floor(lon/grid.cell),gy=Math.floor(lat/grid.cell),seen=new Set();for(let ox=-1;ox<=1;ox++)for(let oy=-1;oy<=1;oy++){for(const index of grid.map.get(`${gx+ox},${gy+oy}`)??[]){if(seen.has(index))continue;seen.add(index);if(pointSegmentDistance(lon,lat,grid.segments[index])<=threshold)return true}}return false}
function buildPolygonSegments(features,radius=1.00012,excludeNearFeatures=null){const pos=[],seen=new Set(),excludeGrid=excludeNearFeatures?.length?boundaryGrid(excludeNearFeatures):null;for(const f of features??[])for(const ring of polygonRings(f)){if(!Array.isArray(ring)||ring.length<2)continue;const step=Math.max(1,Math.ceil(ring.length/1800));for(let i=0;i<ring.length-1;i+=step){const a=ring[i],b=ring[Math.min(i+step,ring.length-1)];if(!a||!b)continue;const key=canonicalSegmentKey(a,b);if(seen.has(key))continue;const midLon=(Number(a[0])+Number(b[0]))/2,midLat=(Number(a[1])+Number(b[1]))/2;if(excludeGrid&&(nearBoundary(midLon,midLat,excludeGrid)||nearBoundary(Number(a[0]),Number(a[1]),excludeGrid)||nearBoundary(Number(b[0]),Number(b[1]),excludeGrid)))continue;seen.add(key);const p1=latLonVector(a[1],a[0],radius),p2=latLonVector(b[1],b[0],radius);pos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z)}}return pos}'''
if old_build not in s:
    raise RuntimeError('buildPolygonSegments anchor not found')
s = s.replace(old_build, new_build, 1)

s = s.replace("function buildRiverBuckets(collection,radius=1.00028)", "function buildRiverBuckets(collection,radius=1.00015)", 1)

anchor = "function snapshotAt(index,year){"
detail_helpers = r'''const DETAIL_RELIEF_TILES=[
  {id:'000_045_30_60',lon0:0,lon1:45,lat0:30,lat1:60},{id:'045_090_30_60',lon0:45,lon1:90,lat0:30,lat1:60},{id:'090_135_30_60',lon0:90,lon1:135,lat0:30,lat1:60},{id:'135_180_30_60',lon0:135,lon1:180,lat0:30,lat1:60},{id:'180_225_30_60',lon0:180,lon1:225,lat0:30,lat1:60},
  {id:'000_045_60_85',lon0:0,lon1:45,lat0:60,lat1:85},{id:'045_090_60_85',lon0:45,lon1:90,lat0:60,lat1:85},{id:'090_135_60_85',lon0:90,lon1:135,lat0:60,lat1:85},{id:'135_180_60_85',lon0:135,lon1:180,lat0:60,lat1:85},{id:'180_225_60_85',lon0:180,lon1:225,lat0:60,lat1:85}
];
function cameraLonLat(v){const r=v.length()||1,lat=Math.asin(v.y/r)*180/Math.PI;let lon=Math.atan2(-v.z,v.x)*180/Math.PI;if(lon<0)lon+=360;return{lon,lat}}
function lonDistance(a,b){let d=Math.abs(a-b)%360;return d>180?360-d:d}
function makeLatLonPatchGeometry(tile,radius=1.000025){const lonSeg=96,latSeg=72,pos=[],uv=[],idx=[];for(let y=0;y<=latSeg;y++){const fy=y/latSeg,lat=tile.lat0+(tile.lat1-tile.lat0)*fy;for(let x=0;x<=lonSeg;x++){const fx=x/lonSeg,lon=tile.lon0+(tile.lon1-tile.lon0)*fx,p=latLonVector(lat,lon,radius);pos.push(p.x,p.y,p.z);uv.push(fx,fy)}}for(let y=0;y<latSeg;y++)for(let x=0;x<lonSeg;x++){const a=y*(lonSeg+1)+x,b=a+1,c=a+(lonSeg+1),d=c+1;idx.push(a,c,b,b,c,d)}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}
function ensureDetailTile(runtime,tile){if(runtime.detailTiles.has(tile.id))return runtime.detailTiles.get(tile.id);const geometry=makeLatLonPatchGeometry(tile),material=new THREE.MeshBasicMaterial({transparent:false,depthWrite:true,depthTest:true});material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-.75;const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;mesh.renderOrder=2;mesh.userData={tile,loaded:false};runtime.detailTiles.set(tile.id,mesh);runtime.detailGroup.add(mesh);runtime.detailLoader.load(`${runtime.base}/data/territory/terrain/etopo30s/${tile.id}.webp`,tex=>{tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=true;tex.anisotropy=Math.min(16,runtime.renderer.capabilities.getMaxAnisotropy());material.map=tex;material.needsUpdate=true;mesh.userData.loaded=true;runtime.render?.()},undefined,()=>{});return mesh}
function updateDetailTerrain(runtime,d){const group=runtime.detailGroup;if(!group)return;const active=d<1.62;group.visible=active;if(!active){for(const mesh of runtime.detailTiles.values())mesh.visible=false;return}const{lon,lat}=cameraLonLat(runtime.camera.position);if(lat<24||lat>89||lon>235){group.visible=false;for(const mesh of runtime.detailTiles.values())mesh.visible=false;return}for(const tile of DETAIL_RELIEF_TILES){const centerLon=(tile.lon0+tile.lon1)/2,centerLat=(tile.lat0+tile.lat1)/2,needed=lonDistance(lon,centerLon)<=50&&Math.abs(lat-centerLat)<=34;if(!needed){const existing=runtime.detailTiles.get(tile.id);if(existing)existing.visible=false;continue}const mesh=ensureDetailTile(runtime,tile);mesh.visible=mesh.userData.loaded}}
'''
if anchor not in s:
    raise RuntimeError('snapshot anchor not found')
s = s.replace(anchor, detail_helpers + anchor, 1)

s = s.replace("overlayGeometry=new THREE.SphereGeometry(1.0003,", "overlayGeometry=new THREE.SphereGeometry(1.00005,", 1)
s = s.replace("opacity:.46", "opacity:.38", 1)

old_groups = "const borderGroup=new THREE.Group(),riverGroup=new THREE.Group(),countryGroup=new THREE.Group(),cityGroup=new THREE.Group();cityGroup.visible=false;scene.add(borderGroup,riverGroup,countryGroup,cityGroup);"
new_groups = "const detailGroup=new THREE.Group(),borderGroup=new THREE.Group(),riverGroup=new THREE.Group(),countryGroup=new THREE.Group(),cityGroup=new THREE.Group();detailGroup.visible=false;cityGroup.visible=false;scene.add(detailGroup,borderGroup,riverGroup,countryGroup,cityGroup);"
if old_groups not in s:
    raise RuntimeError('groups anchor not found')
s = s.replace(old_groups, new_groups, 1)

old_runtime = "const runtime={scene,camera,renderer,labels,geometry,baseMaterial,overlay,overlayGeometry,overlayMaterial,controls,resize:null,ro:null,suppressZoom:false,lastDistance:camera.position.length()};"
new_runtime = "const runtime={scene,camera,renderer,labels,geometry,baseMaterial,overlay,overlayGeometry,overlayMaterial,detailGroup,detailTiles:new Map(),detailLoader:loader,base,controls,resize:null,ro:null,suppressZoom:false,lastDistance:camera.position.length(),render:null};"
if old_runtime not in s:
    raise RuntimeError('runtime anchor not found')
s = s.replace(old_runtime, new_runtime, 1)

old_dynamic = "const updateDynamic=()=>{const d=camera.position.length();const countryMin="
new_dynamic = "const updateDynamic=()=>{const d=camera.position.length();updateDetailTerrain(runtime,d);const countryMin="
s = s.replace(old_dynamic, new_dynamic, 1)

old_render = "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};renderRef.current=render;"
new_render = "const render=()=>{updateDynamic();renderer.render(scene,camera);labels.render(scene,camera)};runtime.render=render;renderRef.current=render;"
s = s.replace(old_render, new_render, 1)

old_cleanup = "[borderGroup,riverGroup].forEach(g=>g.traverse(o=>{o.geometry?.dispose?.();o.material?.dispose?.()}));"
new_cleanup = "[detailGroup,borderGroup,riverGroup].forEach(g=>g.traverse(o=>{o.geometry?.dispose?.();o.material?.map?.dispose?.();o.material?.dispose?.()}));"
s = s.replace(old_cleanup, new_cleanup, 1)

old_border = "const worldBorderFeatures=world.features.filter(f=>!isRussianWorldFeature(f));const all=buildPolygonSegments(worldBorderFeatures,1.0002);"
new_border = "const worldBorderFeatures=world.features.filter(f=>!isRussianWorldFeature(f));const all=buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures);"
if old_border not in s:
    raise RuntimeError('world border anchor not found')
s = s.replace(old_border, new_border, 1)
s = s.replace("const ru=buildPolygonSegments(russiaFeatures,1.00022);", "const ru=buildPolygonSegments(russiaFeatures,1.00014);", 1)

renderer.write_text(s)

# Verify code invariants.
r = renderer.read_text()
required = [
    'DETAIL_RELIEF_TILES',
    'etopo30s/',
    'updateDetailTerrain(runtime,d)',
    'buildPolygonSegments(worldBorderFeatures,1.00012,russiaFeatures)',
    'canonicalSegmentKey',
    'nearBoundary',
    'overlayGeometry=new THREE.SphereGeometry(1.00005',
]
for token in required:
    if token not in r:
        raise RuntimeError(f'missing V27 renderer token: {token}')
for forbidden in ['buildPolygonSegments(worldBorderFeatures,1.0002)', 'buildPolygonSegments(russiaFeatures,1.00022)']:
    if forbidden in r:
        raise RuntimeError(f'old border token remains: {forbidden}')

print('V27 renderer patch verified.')
