import * as THREE from 'three';

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

function patchGeometry(q,segments=96){
  const vertices=[],uvs=[],indices=[];
  for(let y=0;y<=segments;y++){
    const fy=y/segments;
    const lat=q.latMax-(q.latMax-q.latMin)*fy;
    for(let x=0;x<=segments;x++){
      const fx=x/segments;
      const lon=q.lonMin+(q.lonMax-q.lonMin)*fx;
      const p=latLonVector(lat,lon,1.0014);
      vertices.push(p.x,p.y,p.z);
      uvs.push(fx,1-fy);
    }
  }
  const row=segments+1;
  for(let y=0;y<segments;y++)for(let x=0;x<segments;x++){
    const a=y*row+x,b=a+1,c=a+row,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function materialFor(texture){
  const material=new THREE.MeshStandardMaterial({map:texture,color:0xd7d2c7,roughness:.95,metalness:0,emissive:0x202724,emissiveIntensity:.14,depthWrite:true,depthTest:true});
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\nfloat lodLuma=dot(diffuseColor.rgb,vec3(0.299,0.587,0.114));\nvec3 lodMono=vec3(lodLuma*1.03,lodLuma,lodLuma*0.94);\ndiffuseColor.rgb=clamp((lodMono-0.5)*1.2+0.5,0.0,1.0);`);
  };
  material.customProgramCacheKey=()=>`terrain-quadrant-lod-v1`;
  return material;
}

export function createTerrainQuadrantLod({scene,renderer,base}){
  let activeKey=null,mesh=null,loadingKey=null,disposed=false;

  const clear=()=>{
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.map?.dispose?.();mesh.material.dispose();mesh=null;}
    activeKey=null;
  };

  const load=async(key)=>{
    if(disposed||loadingKey===key||activeKey===key)return;
    loadingKey=key;
    try{
      const q=QUADRANTS[key];
      const response=await fetch(`${base}/data/territory/terrain/lod500_${key}.jpg`,{cache:'force-cache'});
      if(!response.ok)throw new Error(`LOD ${key}: ${response.status}`);
      const blob=await response.blob();
      const gpuMax=renderer.capabilities.maxTextureSize||4096;
      const target=Math.min(gpuMax,6144);
      const bitmap=typeof createImageBitmap==='function'
        ? await createImageBitmap(blob,{resizeWidth:target,resizeHeight:target,resizeQuality:'high'})
        : null;
      if(disposed||loadingKey!==key){bitmap?.close?.();return;}
      if(!bitmap)throw new Error('createImageBitmap unavailable');
      const texture=new THREE.Texture(bitmap);
      texture.colorSpace=THREE.SRGBColorSpace;
      texture.minFilter=THREE.LinearMipmapLinearFilter;
      texture.magFilter=THREE.LinearFilter;
      texture.generateMipmaps=true;
      texture.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate=true;
      clear();
      const geometry=patchGeometry(q,96);
      const material=materialFor(texture);
      mesh=new THREE.Mesh(geometry,material);
      mesh.renderOrder=2;
      scene.add(mesh);
      activeKey=key;
    }catch(error){
      console.warn('500m terrain LOD failed',error);
    }finally{
      if(loadingKey===key)loadingKey=null;
    }
  };

  return{
    update(camera,distance){
      if(disposed)return;
      if(distance>1.22){if(mesh)mesh.visible=false;return;}
      const{lat,lon}=cameraCenter(camera);
      if(lat<20||lon>180){if(mesh)mesh.visible=false;return;}
      const key=lon<90?'C1':'D1';
      if(mesh&&activeKey===key){mesh.visible=true;return;}
      load(key);
    },
    dispose(){disposed=true;clear();}
  };
}
