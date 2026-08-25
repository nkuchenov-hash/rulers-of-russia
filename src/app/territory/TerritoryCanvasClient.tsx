'use client';

import dynamic from 'next/dynamic';
import {useEffect,useRef} from 'react';

const HistoricalTerritoryGlobe = dynamic(
  () => import('./HistoricalTerritoryGlobeWebGLV12').then((m) => m.HistoricalTerritoryGlobeWebGLV12),
  { ssr: false }
);

const CAPITAL_REVEAL_SCORE = 3.2;
const CITY_REVEAL_SCORE = 6.0;

function pinchDistance(touches: TouchList) {
  if (touches.length < 2) return null;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx,dy);
}

export function TerritoryCanvasClient() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let zoomScore = 0;
    let lastPinch: number | null = null;

    const tagCityElement = (el: Element) => {
      if (!(el instanceof HTMLElement)) return;
      const text = (el.textContent ?? '').trim();
      if (text.startsWith('★ ')) el.dataset.territoryCityLabel = 'capital';
      else if (text.startsWith('• ')) el.dataset.territoryCityLabel = 'city';
    };

    const tagTree = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      tagCityElement(node);
      node.querySelectorAll('div').forEach(tagCityElement);
    };

    const applyGate = () => {
      root.dataset.territoryCityGuard =
        zoomScore >= CITY_REVEAL_SCORE ? 'cities' :
        zoomScore >= CAPITAL_REVEAL_SCORE ? 'capitals' :
        'locked';
    };

    const changeScore = (delta: number) => {
      zoomScore = Math.max(0,Math.min(10,zoomScore + delta));
      applyGate();
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) tagTree(node);
      }
    });
    observer.observe(root,{subtree:true,childList:true});
    tagTree(root);
    applyGate();

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLCanvasElement)) return;
      // Only the WebGL canvas lives inside the globe host div. The flat-map
      // canvas is a direct child of the scene and must not arm city labels.
      if (target.parentElement?.tagName !== 'DIV') return;
      const amount = Math.max(.35,Math.min(1.15,Math.abs(event.deltaY)/110));
      changeScore(event.deltaY < 0 ? amount : -amount);
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('button');
      if (!button) return;
      const text = (button.textContent ?? '').trim();
      if (text === '+') changeScore(1.25);
      else if (text === '−' || text === '-') changeScore(-1.25);
      else if (text === '◎') {
        zoomScore = 0;
        applyGate();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastPinch = pinchDistance(event.touches);
    };
    const onTouchMove = (event: TouchEvent) => {
      const next = pinchDistance(event.touches);
      if (next === null || lastPinch === null || lastPinch <= 0) {
        lastPinch = next;
        return;
      }
      const ratio = next / lastPinch;
      if (Math.abs(ratio - 1) > .015) changeScore(Math.log(ratio) * 9);
      lastPinch = next;
    };
    const onTouchEnd = () => { lastPinch = null; };

    root.addEventListener('wheel',onWheel,{capture:true,passive:true});
    root.addEventListener('click',onClick,true);
    root.addEventListener('touchstart',onTouchStart,{capture:true,passive:true});
    root.addEventListener('touchmove',onTouchMove,{capture:true,passive:true});
    root.addEventListener('touchend',onTouchEnd,{capture:true,passive:true});
    root.addEventListener('touchcancel',onTouchEnd,{capture:true,passive:true});

    return () => {
      observer.disconnect();
      root.removeEventListener('wheel',onWheel,true);
      root.removeEventListener('click',onClick,true);
      root.removeEventListener('touchstart',onTouchStart,true);
      root.removeEventListener('touchmove',onTouchMove,true);
      root.removeEventListener('touchend',onTouchEnd,true);
      root.removeEventListener('touchcancel',onTouchEnd,true);
    };
  },[]);

  return <div ref={rootRef} data-territory-city-guard="locked">
    <style>{`
      [data-territory-city-guard="locked"] [data-territory-city-label] {
        display: none !important;
      }
      [data-territory-city-guard="capitals"] [data-territory-city-label="city"] {
        display: none !important;
      }
    `}</style>
    <HistoricalTerritoryGlobe initialYear={2026} />
  </div>;
}
