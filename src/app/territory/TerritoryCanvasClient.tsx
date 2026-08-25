'use client';

import dynamic from 'next/dynamic';
import {useEffect,useRef} from 'react';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV10').then((m) => m.HistoricalTerritoryGlobeWebGLV10),
  { ssr: false }
);

const CITY_UNLOCK_SCORE = 3.4;

function isCityLabel(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const font = `${el.style.font} ${el.style.fontFamily}`.toLowerCase();
  return font.includes('georgia') && el.style.pointerEvents === 'none' && Boolean(el.textContent?.trim());
}

export function TerritoryCanvasClient() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let unlocked = false;
    let zoomScore = 0;
    const pointers = new Map<number,{x:number;y:number}>();
    let lastPinchDistance: number | null = null;

    const labels = () => [...root.querySelectorAll('div')].filter(isCityLabel);

    const forceHidden = () => {
      if (unlocked) return;
      for (const label of labels()) {
        if (label.style.display !== 'none' || label.style.getPropertyPriority('display') !== 'important') {
          label.style.setProperty('display','none','important');
        }
      }
    };

    const unlock = () => {
      if (unlocked || zoomScore < CITY_UNLOCK_SCORE) return;
      unlocked = true;
      for (const label of labels()) label.style.removeProperty('display');
    };

    const addZoom = (amount: number) => {
      zoomScore = Math.min(8,zoomScore + amount);
      unlock();
    };

    const removeZoom = (amount: number) => {
      if (unlocked) return;
      zoomScore = Math.max(0,zoomScore - amount);
      forceHidden();
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) addZoom(Math.max(.55,Math.min(1.25,Math.abs(event.deltaY)/120)));
      else if (event.deltaY > 0) removeZoom(Math.max(.35,Math.min(.9,Math.abs(event.deltaY)/160)));
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button) return;
      const text = button.textContent?.trim();
      if (text === '+') addZoom(1.2);
      else if (text === '−' || text === '-') removeZoom(.9);
      else if (text === '◎') {
        unlocked = false;
        zoomScore = 0;
        requestAnimationFrame(forceHidden);
      }
    };

    const pinchDistance = () => {
      const pts = [...pointers.values()];
      if (pts.length < 2) return null;
      return Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      lastPinchDistance = pinchDistance();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      const next = pinchDistance();
      if (next && lastPinchDistance) {
        const ratio = next / lastPinchDistance;
        if (ratio > 1.015) addZoom(Math.min(1.1,Math.log(ratio)*12));
        else if (ratio < .985) removeZoom(Math.min(.8,Math.log(1/ratio)*9));
      }
      lastPinchDistance = next;
    };

    const onPointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      lastPinchDistance = pinchDistance();
    };

    const observer = new MutationObserver(() => forceHidden());
    observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});

    root.addEventListener('wheel',onWheel,{capture:true,passive:true});
    root.addEventListener('click',onClick,true);
    root.addEventListener('pointerdown',onPointerDown,true);
    root.addEventListener('pointermove',onPointerMove,true);
    root.addEventListener('pointerup',onPointerEnd,true);
    root.addEventListener('pointercancel',onPointerEnd,true);

    forceHidden();

    return () => {
      observer.disconnect();
      root.removeEventListener('wheel',onWheel,true);
      root.removeEventListener('click',onClick,true);
      root.removeEventListener('pointerdown',onPointerDown,true);
      root.removeEventListener('pointermove',onPointerMove,true);
      root.removeEventListener('pointerup',onPointerEnd,true);
      root.removeEventListener('pointercancel',onPointerEnd,true);
    };
  },[]);

  return <div ref={rootRef} style={{display:'contents'}}><HistoricalTerritoryGlobe initialYear={2026} /></div>;
}
