import * as THREE from 'three';

const SOURCE_SIZE=21600;
const QUADRANTS={
  C1:{file:'C1',lonMin:0,lonMax:90,latMin:0,latMax:90},
  D1:{file:'D1',lonMin:90,lonMax:180,latMin:0,latMax:90},
};

function latLonVector(lat,lon,r=1){
  const p=lat*Math.PI/180,l=lon*Math.PI/180;
  return new THREE.Vector3(Math.cos(p)*Math.cos(l),Math.sin(p),-Math.cos(p)*Math.sin(l)).multiplyScalar(r);
}

function cameraCenter(camera){
  const n=camera.position.clone().normalize();
  const lat=Math.asin(THREE.MathUtils.clamp(n.y,-1,1))*180/Math.PI;
  let lon=Math.atan2(-n.z,n.x)*180/Math.PI;
  if(lon<0)lon+=360;
  return{lat,lon};
}

function patchGeometry(bounds,segments=180){
  const vertices=[],uvs=[],indices=[];
  for(let y=0;y<=segments;y++){
    const fy=y/segments;
    const lat=bounds.latMax-(bounds.latMax-bounds.latMin)*fy;
    for(let x=0;x<=segments;x++){
      const fx=x/segments;
      const lon=bounds.lonMin+(bounds.lonMax-bounds.lonMin)*fx;
      const p=latLonVector(lat,lon,1.0018);
      vertices.push(p.x,p.y,p.z);
      uvs.push(fx,1-fy);
    }
  }
  const row=segments+1;
  for(let y=0;y<segments;y++)for(let x=0;x<segments;x++){
    const a=y*row+x,b=a+1,c=a+row,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function materialFor(texture){
  const material=new THREE.MeshStandardMaterial({
    map:texture,
    color:0xd7d2c7,
    roughness:.96,
    metalness:0,
    emissive:0x202724,
    emissiveIntensity:.13,
    depthWrite:true,
    depthTest:true,
  });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\nfloat lodLuma=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));\nvec3 lodMono=vec3(lodLuma*1.03,lodLuma,lodLuma*0.94);\ndiffuseColor.rgb=clamp((lodMono-0.5)*1.2+0.5,0.0,1.0);`
    );
  };
  material.customProgramCacheKey=()=>`terrain-native-crop-v24`;
  return material;
}

function chooseQuadrant(lat,lon){
  if(lat<0||lon<0||lon>180)return null;
  return lon<90?QUADRANTS.C1:QUADRANTS.D1;
}

function nativeCropFor(q,lat,lon,distance,maxTextureSize){
  const tangentDeg=Math.acos(THREE.MathUtils.clamp(1/distance,-1,1))*180/Math.PI;
  const desiredSpan=THREE.MathUtils.clamp(tangentDeg*1.55,18,36);
  const maxNativePx=Math.min(maxTextureSize||8192,8192,SOURCE_SIZE);
  const desiredPx=Math.round(desiredSpan/90*SOURCE_SIZE);
  const cropPx=Math.max(3072,Math.min(maxNativePx,desiredPx));
  const spanDeg=cropPx/SOURCE_SIZE*90;

  let lonMin=lon-spanDeg/2;
  let latMax=lat+spanDeg/2;
  lonMin=THREE.MathUtils.clamp(lonMin,q.lonMin,q.lonMax-spanDeg);
  latMax=THREE.MathUtils.clamp(latMax,q.latMin+spanDeg,q.latMax);

  const sx=Math.round((lonMin-q.lonMin)/90*SOURCE_SIZE);
  const sy=Math.round((q.latMax-latMax)/90*SOURCE_SIZE);
  const bounds={
    lonMin,
    lonMax:lonMin+spanDeg,
    latMax,
    latMin:latMax-spanDeg,
  };
  return{sx,sy,cropPx,bounds};
}

export function createTerrainQuadrantLod({scene,renderer,base}){
  let mesh=null;
  let disposed=false;
  let requestToken=0;
  let activeSignature='';
  const blobs=new Map();

  const clear=()=>{
    if(!mesh)return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.map?.image?.close?.();
    mesh.material.map?.dispose?.();
    mesh.material.dispose();
    mesh=null;
    activeSignature='';
  };

  const getBlob=async(key)=>{
    if(blobs.has(key))return blobs.get(key);
    const promise=fetch(`${base}/data/territory/terrain/lod500_${key}.jpg`,{cache:'force-cache'})
      .then(response=>{
        if(!response.ok)throw new Error(`LOD ${key}: ${response.status}`);
        return response.blob();
      });
    blobs.set(key,promise);
    return promise;
  };

  const loadCrop=async(key,q,crop,signature)=>{
    const token=++requestToken;
    try{
      const blob=await getBlob(key);
      if(disposed||token!==requestToken)return;
      if(typeof createImageBitmap!=='function')throw new Error('createImageBitmap unavailable');
      const bitmap=await createImageBitmap(blob,crop.sx,crop.sy,crop.cropPx,crop.cropPx);
      if(disposed||token!==requestToken){bitmap.close?.();return;}

      const texture=new THREE.Texture(bitmap);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=true;
      texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate=true;

      clear();
      const geometry=patchGeometry(crop.bounds,180);
      const material=materialFor(texture);
      mesh=new THREE.Mesh(geometry,material);
      mesh.renderOrder=2;
      scene.add(mesh);
      activeSignature=signature;
    }catch(error){
      console.warn('Native 500m terrain crop failed',error);
    }
  };

  return{
    update(camera,distance){
      if(disposed)return;
      if(distance>1.24){if(mesh)mesh.visible=false;return;}

      const{lat,lon}=cameraCenter(camera);
      const q=chooseQuadrant(lat,lon);
      if(!q){if(mesh)mesh.visible=false;return;}

      const crop=nativeCropFor(q,lat,lon,distance,renderer.capabilities.maxTextureSize||8192);
      const centerLon=(crop.bounds.lonMin+crop.bounds.lonMax)/2;
      const centerLat=(crop.bounds.latMin+crop.bounds.latMax)/2;
      const step=Math.max(1.5,(crop.bounds.lonMax-crop.bounds.lonMin)/6);
      const quantLon=Math.round(centerLon/step)*step;
      const quantLat=Math.round(centerLat/step)*step;
      const signature=`${q.file}:${crop.cropPx}:${quantLon.toFixed(2)}:${quantLat.toFixed(2)}`;

      if(mesh&&activeSignature===signature){mesh.visible=true;return;}
      if(activeSignature===signature)return;
      loadCrop(q.file,q,crop,signature);
    },
    dispose(){
      disposed=true;
      requestToken++;
      clear();
      blobs.clear();
    },
  };
}
