'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {geoArea,geoCentroid,geoEquirectangular,geoGraticule,geoPath} from 'd3-geo';
import {isRussianWorldFeature,worldBackgroundTransitionPhase} from './worldRussiaFeatureFilter.mjs';
import {zoomFlatCameraAt} from './flatCameraZoom.mjs';
import {visibleTerrainCopies} from './flatTerrainTiles.mjs';

const TWO_PI=Math.PI*2;
const PALETTE=['#879477','#b49b79','#808d9a','#9d8b72','#809995','#a18b89','#8d929e'];
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
  // Track active touch pointers separately. The previous single-pointer drag
  // discarded the first finger when a second one landed, so mobile users
  // could not pinch-zoom the 2D historical map.
  const pointersRef=useRef(new Map());
  const gestureRef=useRef(null);
  const [size,setSize]=useState({width:1,height:1});
  const [terrain,setTerrain]=useState(null);
  const focusLon=focus[0],focusLat=focus[1];

  // The historical background and its labels depend on the selected year,
  // not on camera movement. Keep source feature indices for stable colors.
  // Filtering, area ranking and geographic centroids must not run on every
  // pointer move, wheel step or zoom-button redraw.
  const backgroundPhase=worldBackgroundTransitionPhase(year,month);
  const worldFeatures=useMemo(()=>(world?.features??[])
    .filter(feature=>feature?.geometry)
    .map((feature,index)=>({feature,index}))
    .filter(({feature})=>!isRussianWorldFeature(feature,year,month)),[world,year,backgroundPhase]);
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
    const fullWidth=TWO_PI*scale;
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
      const x0=tx-scale*(Math.PI+focusLon*Math.PI/180);
      const y0=ty-scale*Math.PI/2;
      ctx.globalAlpha=.88;
      for(const repeat of visibleTerrainCopies(x0,fullWidth,width))
        ctx.drawImage(terrain,x0+repeat*fullWidth,y0,fullWidth,Math.PI*scale);
      ctx.globalAlpha=1;
    }

    // The projection clips vectors to one world even though the terrain repeats.
    // Draw only the world copies intersecting the viewport, so after crossing
    // the antimeridian (or panning several revolutions) state fills, verified
    // boundaries, graticule and labels remain aligned with the relief.
    for(const repeat of visibleTerrainCopies(tx-Math.PI*scale,fullWidth,width)){
      ctx.save();
      ctx.translate(repeat*fullWidth,0);
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
        const screenX=point?.[0]+repeat*fullWidth;
        if(!point||screenX<50||screenX>width-50||point[1]<16||point[1]>height-16)continue;
        ctx.lineWidth=3;ctx.strokeStyle='rgba(4,14,18,.9)';
        ctx.fillStyle='rgba(244,234,213,.92)';
        ctx.strokeText(name,point[0],point[1],150);
        ctx.fillText(name,point[0],point[1],150);
      }
    }
      ctx.restore();
    }
    // No geometry means no Russian territory is painted. The existing
    // History Core accuracy caption reports that state explicitly.
  },[size,terrain,worldFeatures,worldLabels,russiaFeatures,verifiedBoundaries,historyLoading,
    worldYear,year,focusLon,focusLat,mode,camera,mobile]);

  const pinchSnapshot=useCallback(()=>{
    const points=[...pointersRef.current.values()];
    if(points.length!==2)return null;
    const [a,b]=points;
    return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,
      distance:Math.hypot(b.x-a.x,b.y-a.y)};
  },[]);
  const onPointerDown=useCallback(e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    pointersRef.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    gestureRef.current=pinchSnapshot();
    e.currentTarget.setPointerCapture(e.pointerId);
  },[pinchSnapshot]);
  const onPointerMove=useCallback(e=>{
    const pointers=pointersRef.current;
    const previous=pointers.get(e.pointerId);
    if(!previous)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
      gestureRef.current=null;
      const dx=e.clientX-previous.x,dy=e.clientY-previous.y;
      onCameraChange(prev=>({...prev,dx:prev.dx+dx,dy:prev.dy+dy}));
      return;
    }
    const next=pinchSnapshot();
    const before=gestureRef.current;
    gestureRef.current=next;
    if(!before||!next||before.distance<1||next.distance<1)return;
    const bounds=hostRef.current?.getBoundingClientRect();
    if(!bounds)return;
    // Preserve the geographical point beneath the previous finger midpoint
    // while also following midpoint translation. Clamp at the existing 1–12
    // zoom limits; use the APPLIED ratio to avoid jumps at either limit.
    const anchorX=before.x-bounds.left-bounds.width/2;
    const anchorY=before.y-bounds.top-bounds.height/2;
    onCameraChange(prev=>{
      const zoomed=zoomFlatCameraAt(prev,next.distance/before.distance,anchorX,anchorY);
      return {...zoomed,dx:zoomed.dx+(next.x-before.x),dy:zoomed.dy+(next.y-before.y)};
    });
  },[onCameraChange,pinchSnapshot]);
  const release=useCallback(e=>{
    pointersRef.current.delete(e.pointerId);
    // Never reuse a two-finger baseline after one finger is lifted.
    gestureRef.current=pinchSnapshot();
  },[pinchSnapshot]);
  // A canvas-only map otherwise cannot be navigated without a pointer.
  // Only act while the map host itself has keyboard focus; never intercept
  // the timeline, date selectors, or page-wide shortcuts.
  const onKeyDown=useCallback(e=>{
    const step=e.shiftKey?120:48;
    switch(e.key){
      case 'ArrowLeft':
        onCameraChange(prev=>({...prev,dx:prev.dx+step}));
        break;
      case 'ArrowRight':
        onCameraChange(prev=>({...prev,dx:prev.dx-step}));
        break;
      case 'ArrowUp':
        onCameraChange(prev=>({...prev,dy:prev.dy+step}));
        break;
      case 'ArrowDown':
        onCameraChange(prev=>({...prev,dy:prev.dy-step}));
        break;
      case '+':
      case '=':
        onCameraChange(prev=>zoomFlatCameraAt(prev,1.15,0,0));
        break;
      case '-':
      case '_':
        onCameraChange(prev=>zoomFlatCameraAt(prev,1/1.15,0,0));
        break;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  },[onCameraChange]);
  // React registers wheel listeners as passive in Chromium, so calling
  // preventDefault from onWheel cannot stop the page from scrolling while
  // the user zooms the map. Use an explicit non-passive native listener.
  useEffect(()=>{
    const node=hostRef.current;
    if(!node)return;
    const handleWheel=e=>{
      e.preventDefault();
      if(e.deltaY===0)return;
      const bounds=node.getBoundingClientRect();
      const anchorX=e.clientX-bounds.left-bounds.width/2;
      const anchorY=e.clientY-bounds.top-bounds.height/2;
      const factor=e.deltaY>0?.85:1.15;
      onCameraChange(prev=>zoomFlatCameraAt(prev,factor,anchorX,anchorY));
    };
    node.addEventListener('wheel',handleWheel,{passive:false});
    return ()=>node.removeEventListener('wheel',handleWheel);
  },[onCameraChange]);

  return <div ref={hostRef} className="territory-flat-host"
      role="group" tabIndex={0}
      aria-label="Плоская историческая карта: перетаскивайте для перемещения, используйте колесо мыши или два пальца для масштаба. С клавиатуры: стрелки для перемещения, Shift со стрелками для быстрого перемещения, плюс и минус для масштаба"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      >
    <canvas ref={canvasRef} data-territory-flat-map="true"
      data-history-month={historyLoading?'':historyState?.month??''}
      data-camera-zoom={camera.zoom.toFixed(3)}
      data-camera-dx={camera.dx.toFixed(3)} data-camera-dy={camera.dy.toFixed(3)}
      role="img" aria-label={'Плоская карта исторических границ за '+month+'.'+year}/>
    <div className="territory-flat-watermark" aria-hidden="true">
      2D · Исторические границы · {worldYear===year?'Мировой срез':'Мировой фон приблизительный'}
    </div>
  </div>;
}
