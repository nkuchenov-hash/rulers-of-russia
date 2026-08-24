'use client';

import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {CSS2DObject,CSS2DRenderer} from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {TERRITORY_MAX_YEAR,TERRITORY_MIN_YEAR,territoryPeriodAt} from './territoryChronology';
import {TERRITORY_PLACES} from './territoryPlaces';
import styles from './territory-webgl.module.css';

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const SURFACE_URL='https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg';
const NORMAL_LOCAL='/data/territory/terrain/earth_normal_2048.jpg';

function latLonVector(lat,lon,r=1){
  const p=lat*Math.PI/180,l=lon*Math.PI/180;
  return new THREE.Vector3(Math.cos(p)*Math.cos(l),Math.sin(p),-Math.cos(p)*Math.sin(l)).multiplyScalar(r);
}

function makeLabel(place){
  const el=document.createElement('div');
  el.textContent=`${place.kind==='capital'?'★':'•'} ${place.name}`;
  el.style.cssText='display:none;white-space:nowrap;font:600 14px Georgia,serif;color:#f1e5c9;text-shadow:0 1px 2px #061117,0 0 3px #061117;transform:translate(8px,-50%);pointer-events:none;user-select:none';
  if(place.kind==='capital') el.style.color='#f0d58f';
  const obj=new CSS2DObject(el);
  obj.position.copy(latLonVector(place.lat,place.lon,1.018));
  obj.userData={place};
  return obj;
}

export function HistoricalTerritoryGlobeWebGLV8({initialYear=TERRITORY_MAX_YEAR}){
  const hostRef=useRef(null);
  const [year,setYear]=useState(clamp(initialYear,TERRITORY_MIN_YEAR,TERRITORY_MAX_YEAR));
  const period=territoryPeriodAt(year);

  useEffect(()=>{
    const host=hostRef.current;
    if(!host) return;
    const compact=window.innerWidth<=720;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(compact?42:36,1,0.01,100);
    camera.position.set(2.35,1.28,2.15);

    let renderer;
    try{
      renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'default'});
    }catch{
      host.innerHTML='<div style="padding:32px;color:#eee;font:16px system-ui">WebGL недоступен в этом браузере.</div>';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,compact?1.1:1.35));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.setClearColor(0x071116,1);
    host.appendChild(renderer.domElement);

    const labels=new CSS2DRenderer();
    labels.domElement.style.position='absolute';
    labels.domElement.style.inset='0';
    labels.domElement.style.pointerEvents='none';
    labels.domElement.style.overflow='hidden';
    host.appendChild(labels.domElement);

    const geometry=new THREE.SphereGeometry(1,compact?64:96,compact?40:64);
    const material=new THREE.MeshStandardMaterial({color:0x21485a,roughness:.9,metalness:0});
    const globe=new THREE.Mesh(geometry,material);
    scene.add(globe);

    const loader=new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(SURFACE_URL,(t)=>{
      t.colorSpace=THREE.SRGBColorSpace;
      t.minFilter=THREE.LinearMipmapLinearFilter;
      t.magFilter=THREE.LinearFilter;
      t.generateMipmaps=true;
      material.color.set(0xffffff);
      material.map=t;
      material.needsUpdate=true;
    },undefined,()=>{});

    const base=process.env.NEXT_PUBLIC_BASE_PATH??'';
    loader.load(`${base}${NORMAL_LOCAL}`,(n)=>{
      n.colorSpace=THREE.NoColorSpace;
      n.minFilter=THREE.LinearMipmapLinearFilter;
      n.magFilter=THREE.LinearFilter;
      n.generateMipmaps=true;
      material.normalMap=n;
      material.normalScale.set(.55,.55);
      material.needsUpdate=true;
    },undefined,()=>{});

    scene.add(new THREE.HemisphereLight(0xe6edf0,0x11100c,1.25));
    const sun=new THREE.DirectionalLight(0xffe7bd,1.65);
    sun.position.set(-3,3,4);
    scene.add(sun);

    const gridPos=[];
    const add=(a,b)=>{
      const p1=latLonVector(a[1],a[0],1.005),p2=latLonVector(b[1],b[0],1.005);
      gridPos.push(p1.x,p1.y,p1.z,p2.x,p2.y,p2.z);
    };
    for(let lat=-80;lat<=80;lat+=20) for(let lon=-180;lon<180;lon+=8) add([lon,lat],[lon+8,lat]);
    for(let lon=-180;lon<180;lon+=20) for(let lat=-80;lat<80;lat+=8) add([lon,lat],[lon,lat+8]);
    const gridGeo=new THREE.BufferGeometry();
    gridGeo.setAttribute('position',new THREE.Float32BufferAttribute(gridPos,3));
    scene.add(new THREE.LineSegments(gridGeo,new THREE.LineBasicMaterial({color:0xa9c0c7,transparent:true,opacity:.12,depthWrite:false})));

    const cityGroup=new THREE.Group();
    for(const place of TERRITORY_PLACES){
      if((place.from??TERRITORY_MIN_YEAR)<=year && (place.to??TERRITORY_MAX_YEAR)>=year) cityGroup.add(makeLabel(place));
    }
    scene.add(cityGroup);

    const controls=new OrbitControls(camera,renderer.domElement);
    controls.enableDamping=true;
    controls.dampingFactor=.05;
    controls.enablePan=false;
    controls.rotateSpeed=.72;
    controls.zoomSpeed=.8;
    controls.minDistance=1.015;
    controls.maxDistance=6;

    const resize=()=>{
      const r=host.getBoundingClientRect();
      const w=Math.max(1,r.width),h=Math.max(1,r.height);
      renderer.setSize(w,h,false);
      labels.setSize(w,h);
      camera.aspect=w/h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro=new ResizeObserver(resize);
    ro.observe(host);

    let raf=0;
    const camDir=new THREE.Vector3(),objDir=new THREE.Vector3();
    const loop=()=>{
      controls.update();
      const d=camera.position.length();
      camDir.copy(camera.position).normalize();
      for(const obj of cityGroup.children){
        objDir.copy(obj.position).normalize();
        const front=objDir.dot(camDir)>.62;
        const place=obj.userData.place;
        const visible=place.kind==='capital'?d<1.75:d<1.28;
        obj.element.style.display=front&&visible?'block':'none';
      }
      renderer.render(scene,camera);
      labels.render(scene,camera);
      raf=requestAnimationFrame(loop);
    };
    loop();

    return()=>{
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geometry.dispose();
      gridGeo.dispose();
      material.map?.dispose?.();
      material.normalMap?.dispose?.();
      material.dispose();
      renderer.dispose();
      if(renderer.domElement.parentNode===host) host.removeChild(renderer.domElement);
      if(labels.domElement.parentNode===host) host.removeChild(labels.domElement);
    };
  },[year]);

  return <main className={styles.shell}>
    <div ref={hostRef} className={styles.globeStage} style={{position:'relative',minHeight:'70vh'}} />
    <section className={styles.timelinePanel}>
      <div className={styles.timelineMeta}>
        <strong>{year}</strong>
        <span>{period.label}</span>
      </div>
      <input
        aria-label="Год"
        type="range"
        min={TERRITORY_MIN_YEAR}
        max={TERRITORY_MAX_YEAR}
        value={year}
        onChange={(e)=>setYear(Number(e.target.value))}
        style={{width:'100%'}}
      />
    </section>
  </main>;
}
