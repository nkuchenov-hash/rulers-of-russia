'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {geoArea,geoCentroid,geoEquirectangular,geoGraticule,geoPath} from 'd3-geo';
import {isRussianWorldFeature} from './worldRussiaFeatureFilter.mjs';

const TWO_PI=Math.PI*2;
const PALETTE=['#879477','#b49b79','#808d9a','#9d8b72','#809995','#a18b89','#8d929e'];
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const countryName=f=>{const p=f?.properties??{};return[p.NAME_RU,p.name_ru,p.NAME,p.name,p.ADMIN,p.entity].find(x=>typeof x==='string'&&x.trim())??''};
const colorFor=(f,i)=>{const name=countryName(f);let hash=i;for(let j=0;j<name.length;j++)hash=((hash<<5)-hash+name.charCodeAt(j))|0;return PALETTE[Math.abs(hash)%PALETTE.length]};
const graticule=geoGraticule().step([30,30])();

/**
 * A planar view of exactly the same dated History Core geometry the globe uses.
 * No remote geometry, independent state cache, inferred dates, or legacy archive.
 * Country polygons are only approximate year-level world context.
 */
export function HistoricalTerritoryFlatMap({
  world,russiaFeatures,verifiedBoundaries,historyState,historyLoading,
  worldYear,year,month,focus,mode,camera,onCameraChange,mobile
}){
  const canvasRef=useRef(null);
  const hostRef=useRef(null);
  const dragRef=useRef(null);
  const [size,setSize]=useState({width:1,height:1});
  const [terrain,setTerrain]=useState(null);
  const focusLon=focus[0],focusLat=focus[1];

  // The historical background and its labels depend on the selected year,
  // not on camera movement. Keep source feature indices for stable colors.
  // Filtering, area ranking and geographic centroids must not run on every
  // pointer move, wheel step or zoom-button redraw.
  const worldFeatures=useMemo(()=>(world?.features??[])
    .filter(feature=>feature?.geometry)
    .map((feature,index)=>({feature,index}))
    .filter(({feature})=>!isRussianWorldFeature(feature,year)),[world,year]);
  const worldLabels=useMemo(()=>worldFeatures
    .map(({feature})=>({feature,area:geoArea(feature)}))
    .filter(({area})=>Number.isFinite(area)&&area>0)
    .sort((a,b)=>b.area-a.area)
    .slice(0,mobile?18:35)
    .map(({feature})=>({name:countryName(feature),coordinates:geoCentroid(feature)}))
    .filter(({name,coordinates})=>name&&name.length<=21
      &&Number.isFinite(coordinates?.[0])&&Number.isFinite(coordinates?.[1])),
  [worldFeatures,mobile]);

  useEffect(()=>{
    const node=hostRef.current;
    if(!node)return;
    const measure=()=>{
      const box=node.getBoundingClientRect();
      const width=Math.round(box.width),height=Math.round(box.height);
      if(width>0&&height>0)setSize(prev=>prev.width===width&&prev.height===height?prev:{width,height});
    };
    const observer=new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    let mounted=true;
    const image=new Image();
    image.onload=()=>{if(mounted)setTerrain(image)};
    image.onerror=()=>{if(mounted)setTerrain(null)};
    image.src=(process.env.NEXT_PUBLIC_BASE_PATH??'')+'/data/territory/terrain/earth_relief_4096.webp';
    return()=>{mounted=false;image.onload=null;image.onerror=null};
  },[]);

  useEffect(()=>{
    if(size.width<2||size.height<2)return;
    const canvas=canvasRef.current,ctx=canvas?.getContext('2d');
    if(!ctx)return;
    const {width,height}=size;
    const dpr=Math.min(window.devicePixelRatio||1,mobile?1.5:2);
    const bitmapWidth=Math.max(1,Math.round(width*dpr));
    const bitmapHeight=Math.max(1,Math.round(height*dpr));
    // Assigning canvas.width/height reallocates and clears the bitmap even
    // when the value is unchanged. Camera redraws must reuse the buffer.
    if(canvas.width!==bitmapWidth)canvas.width=bitmapWidth;
    if(canvas.height!==bitmapHeight)canvas.height=bitmapHeight;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle='#071821';
    ctx.fillRect(0,0,width,height);

    // All camera actions affect the two-dimensional plane, not a second globe.
    const scale=Math.min(width/TWO_PI,height/Math.PI)*camera.zoom;
    // Center both longitude and latitude on the selected Russian period.
    // The equirectangular map itself remains north-up: pan the projected
    // y-origin instead of rotating the terrestrial latitude axis.
    const tx=width/2+camera.dx,ty=height/2+camera.dy+scale*focusLat*Math.PI/180;
    const projection=geoEquirectangular()
      .rotate([-focusLon,0])
      .translate([tx,ty])
      .scale(scale)
      .precision(.35);
    const path=geoPath(projection,ctx);

    if(terrain?.complete&&terrain.naturalWidth&&mode==='relief'){
      // Equirectangular terrain is the same source as the globe. Repeat it
      // across the antimeridian, allowing seamless longitude panning.
      const fullWidth=TWO_PI*scale;
      const x0=tx-scale*(Math.PI+focusLon*Math.PI/180);
      const y0=ty-scale*Math.PI/2;
      ctx.globalAlpha=.88;
      for(let repeat=-2;repeat<=2;repeat++)
        ctx.drawImage(terrain,x0+repeat*fullWidth,y0,fullWidth,Math.PI*scale);
      ctx.globalAlpha=1;
    }

    ctx.beginPath();
    path(graticule);
    ctx.strokeStyle='rgba(191,207,199,.14)';
    ctx.lineWidth=1;
    ctx.stroke();

    // These polygons are year-level context; Russian fill is separate.
    for(const {feature,index} of worldFeatures){
      ctx.beginPath();path(feature);
      ctx.fillStyle=colorFor(feature,index);
      ctx.globalAlpha=mode==='states'?.79:.32;
      ctx.fill('evenodd');
      ctx.globalAlpha=worldYear===year?.68:.43;
      ctx.strokeStyle='#d1cbb9';
      ctx.lineWidth=.8;
      ctx.stroke();
    }
    ctx.globalAlpha=1;

    if(!historyLoading){
      for(const feature of russiaFeatures??[]){
        ctx.beginPath();path(feature);
        ctx.fillStyle='#819a65';
        ctx.globalAlpha=mode==='states'?.94:.70;
        ctx.fill('evenodd');
        ctx.globalAlpha=1;
        ctx.strokeStyle='#efcf75';
        ctx.lineWidth=mobile?2.2:2.7;
        ctx.stroke();
      }
      for(const item of verifiedBoundaries??[]){
        const geometry=item?.data;
        if(!geometry)continue;
        const maritime=item.entry?.track==='maritime-jurisdiction';
        ctx.beginPath();path(geometry);
        ctx.strokeStyle=maritime?'#a9c7c5':'#f3d889';
        ctx.lineWidth=maritime?1.7:2.4;
        ctx.globalAlpha=item.entry?.displayDatumStatus==='source-geographic-untransformed'?.65:1;
        ctx.stroke();
      }
    }
    ctx.globalAlpha=1;

    if(camera.zoom>=1.5){
      ctx.font='600 16px Georgia,serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      for(const {name,coordinates} of worldLabels){
        const point=projection(coordinates);
        if(!point||point[0]<50||point[0]>width-50||point[1]<16||point[1]>height-16)continue;
        ctx.lineWidth=3;ctx.strokeStyle='rgba(4,14,18,.9)';
        ctx.fillStyle='rgba(244,234,213,.92)';
        ctx.strokeText(name,point[0],point[1],150);
        ctx.fillText(name,point[0],point[1],150);
      }
    }
    // No geometry means no Russian territory is painted. The existing
    // History Core accuracy caption reports that state explicitly.
  },[size,terrain,worldFeatures,worldLabels,russiaFeatures,verifiedBoundaries,historyLoading,
    worldYear,year,focusLon,focusLat,mode,camera,mobile]);

  const onPointerDown=useCallback(e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    dragRef.current={id:e.pointerId,x:e.clientX,y:e.clientY};
    e.currentTarget.setPointerCapture(e.pointerId);
  },[]);
  const onPointerMove=useCallback(e=>{
    const drag=dragRef.current;
    if(!drag||drag.id!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    dragRef.current={...drag,x:e.clientX,y:e.clientY};
    onCameraChange(prev=>({...prev,dx:prev.dx+dx,dy:prev.dy+dy}));
  },[onCameraChange]);
  const release=useCallback(e=>{
    if(dragRef.current?.id===e.pointerId)dragRef.current=null;
  },[]);
  const onWheel=useCallback(e=>{
    e.preventDefault();
    const next=e.deltaY>0?.85:1.15;
    onCameraChange(prev=>({...prev,zoom:clamp(prev.zoom*next,1,12)}));
  },[onCameraChange]);

  return <div ref={hostRef} className="territory-flat-host"
      aria-label="Плоская историческая карта: перетаскивайте для перемещения, вращайте колесо для масштаба"
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onWheel={onWheel}>
    <canvas ref={canvasRef} data-territory-flat-map="true"
      data-history-month={historyLoading?'':historyState?.month??''}
      data-camera-zoom={camera.zoom.toFixed(3)}
      role="img" aria-label={'Плоская карта исторических границ за '+month+'.'+year}/>
    <div className="territory-flat-watermark" aria-hidden="true">
      2D · Исторические границы · {worldYear===year?'Мировой срез':'Мировой фон приблизительный'}
    </div>
  </div>;
}
