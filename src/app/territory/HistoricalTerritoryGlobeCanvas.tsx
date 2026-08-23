'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoArea, geoCentroid, geoDistance, geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import { POLITY_TRANSITION_YEARS, TERRITORY_MAX_YEAR, TERRITORY_MIN_YEAR, territoryPeriodAt } from './territoryChronology';
import { TERRITORY_PLACES } from './territoryPlaces';
import styles from './territory-globe.module.css';

type ViewMode = 'globe' | 'map';
type Rotation = [number, number, number];
type AnyFeature = Feature<Geometry, Record<string, unknown>>;
type AnyCollection = FeatureCollection<Geometry, Record<string, unknown>>;
type RussiaManifest = { polities?: Array<{ polity_id: string; file: string | null; features: number }> };
type WorldIndex = { snapshots: Array<{ year: number; file: string }> };
type Point = { x: number; y: number };
type Label = { text: string; x: number; y: number; size: number; priority: number; kind: 'country' | 'russia' | 'capital' | 'regional' };

const sphere = { type: 'Sphere' } as const;
const graticule = geoGraticule10();
const MAX_FEATURE_AREA = 2.2;
const PALETTE = ['#586553', '#6a604e', '#4d6965', '#6b534f', '#536957', '#5e5768', '#72694a', '#4c6058', '#6a5e50'];
const COUNTRY_NAME_RU: Record<string, string> = {
  Russia: 'Россия', US: 'США', USA: 'США', Canada: 'Канада', Greenland: 'Гренландия', Iceland: 'Исландия',
  Norway: 'Норвегия', Sweden: 'Швеция', Finland: 'Финляндия', Denmark: 'Дания', Poland: 'Польша', Germany: 'Германия',
  France: 'Франция', Italy: 'Италия', Spain: 'Испания', Portugal: 'Португалия', UK: 'Великобритания', Ireland: 'Ирландия',
  Belarus: 'Беларусь', Ukraine: 'Украина', Lithuania: 'Литва', Latvia: 'Латвия', Estonia: 'Эстония', Georgia: 'Грузия', Armenia: 'Армения',
  Azerbaijan: 'Азербайджан', Kazakhstan: 'Казахстан', China: 'Китай', Mongolia: 'Монголия', India: 'Индия', Pakistan: 'Пакистан',
  Afghanistan: 'Афганистан', Iran: 'Иран', Iraq: 'Ирак', Turkey: 'Турция', Syria: 'Сирия', Egypt: 'Египет', Japan: 'Япония',
  Korea: 'Корея', Greece: 'Греция', Austria: 'Австрия', Hungary: 'Венгрия', Romania: 'Румыния', Bulgaria: 'Болгария', Serbia: 'Сербия',
  'Golden Horde': 'Золотая Орда', Novgorod: 'Новгород', Muscovy: 'Москва', 'Grand Duchy of Moscow': 'Московское княжество',
  Byzantium: 'Византия', 'Ottoman Empire': 'Османская империя', 'Polish-Lithuanian Commonwealth': 'Речь Посполитая',
  'Grand Duchy of Lithuania': 'Великое княжество Литовское'
};

function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }
function yearPart(v: unknown) { const m = String(v ?? '').match(/-?\d{3,4}/); return m ? Number(m[0]) : null; }
function validAt(f: AnyFeature, year: number) {
  const s = yearPart(f.properties?.start_date); const e = yearPart(f.properties?.end_date);
  return (s === null || year >= s) && (e === null || year <= e);
}
function reverseRing(ring: Position[]) { return [...ring].reverse(); }
function normalizeFeature(feature: AnyFeature): AnyFeature | null {
  if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return feature;
  let next = feature;
  if (geoArea(next as never) > Math.PI * 2) {
    if (next.geometry.type === 'Polygon') {
      const geometry: Polygon = { type: 'Polygon', coordinates: next.geometry.coordinates.map(reverseRing) };
      next = { ...next, geometry };
    } else {
      const geometry: MultiPolygon = { type: 'MultiPolygon', coordinates: next.geometry.coordinates.map((p) => p.map(reverseRing)) };
      next = { ...next, geometry };
    }
  }
  const area = geoArea(next as never);
  if (!Number.isFinite(area) || area <= 0 || area > MAX_FEATURE_AREA) return null;
  return next;
}
function normalizeCollection(c: AnyCollection): AnyCollection {
  return { ...c, features: c.features.map(normalizeFeature).filter((x): x is AnyFeature => Boolean(x)) };
}
function featureName(f: AnyFeature) {
  const p = f.properties ?? {};
  const values = [p.ABBREVN, p.NAME, p.SUBJECTO, p.PARTOF, p.name, p.ADMIN, p.entity, p.polity];
  const v = values.find((x) => typeof x === 'string' && x.trim());
  return typeof v === 'string' ? v.trim() : '';
}
function colorFor(f: AnyFeature, i: number) {
  const n = featureName(f); let h = 23 + i;
  for (let k = 0; k < n.length; k++) h = ((h << 5) - h + n.charCodeAt(k)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
function selectRussia(c: AnyCollection | null, year: number) {
  if (!c?.features.length) return [] as AnyFeature[];
  const exact = c.features.filter((f) => validAt(f, year)); if (exact.length) return exact;
  const prev = c.features.map((feature) => ({ feature, start: yearPart(feature.properties?.start_date) }))
    .filter((x): x is { feature: AnyFeature; start: number } => x.start !== null && x.start <= year).sort((a, b) => b.start - a.start);
  if (!prev.length) return [];
  return prev.filter((x) => x.start === prev[0].start).map((x) => x.feature);
}
function box(l: Label) {
  const w = l.text.length * l.size * .56 + (l.kind === 'capital' ? 18 : 8); const h = l.size * 1.25 + 7;
  const offset = l.kind === 'capital' || l.kind === 'regional' ? w / 2 : 0;
  return { l: l.x - w / 2 + offset, r: l.x + w / 2 + offset, t: l.y - h / 2, b: l.y + h / 2 };
}
function collide(a: ReturnType<typeof box>, b: ReturnType<typeof box>, p = 7) { return !(a.r + p < b.l || a.l - p > b.r || a.b + p < b.t || a.t - p > b.b); }
function acceptLabels(labels: Label[], width: number, height: number, portrait: boolean) {
  const accepted: Label[] = []; const boxes: ReturnType<typeof box>[] = []; const top = portrait ? 155 : 90; const bottom = portrait ? 125 : 95;
  for (const l of [...labels].sort((a, b) => b.priority - a.priority)) {
    const b = box(l); if (b.l < 12 || b.r > width - 12 || b.t < top || b.b > height - bottom) continue;
    if (boxes.some((x) => collide(x, b, l.kind === 'regional' ? 4 : 8))) continue;
    accepted.push(l); boxes.push(b);
  }
  return accepted;
}

function useData(year: number, polityId: string) {
  const [index, setIndex] = useState<WorldIndex | null>(null); const [manifest, setManifest] = useState<RussiaManifest | null>(null);
  const [world, setWorld] = useState<AnyCollection | null>(null); const [worldYear, setWorldYear] = useState<number | null>(null); const [russia, setRussia] = useState<AnyCollection | null>(null);
  const worldCache = useRef(new Map<string, AnyCollection>()); const russiaCache = useRef(new Map<string, AnyCollection>());
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; const c = new AbortController();
    Promise.all([fetch(`${base}/data/territory/world-history/index.json`, { signal: c.signal }).then((r) => r.json()), fetch(`${base}/data/territory/archive/manifest.json`, { signal: c.signal }).then((r) => r.json())])
      .then(([a, b]) => { if (!c.signal.aborted) { setIndex(a); setManifest(b); } }).catch(() => undefined); return () => c.abort();
  }, []);
  useEffect(() => {
    if (!index?.snapshots.length) return; const list = [...index.snapshots].sort((a, b) => a.year - b.year); const s = [...list].reverse().find((x) => x.year <= year) ?? list[0];
    const cached = worldCache.current.get(s.file); if (cached) { setWorld(cached); setWorldYear(s.year); return; }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; const c = new AbortController();
    fetch(`${base}/data/territory/world-history/${s.file}`, { signal: c.signal, cache: 'force-cache' }).then((r) => r.json()).then(normalizeCollection).then((d) => { worldCache.current.set(s.file, d); if (!c.signal.aborted) { setWorld(d); setWorldYear(s.year); } }).catch(() => undefined); return () => c.abort();
  }, [index, year]);
  useEffect(() => {
    const e = manifest?.polities?.find((p) => p.polity_id === polityId && p.file && p.features > 0); if (!e?.file) { setRussia(null); return; }
    const cached = russiaCache.current.get(e.file); if (cached) { setRussia(cached); return; }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; const c = new AbortController();
    fetch(`${base}/data/territory/archive/${e.file}`, { signal: c.signal, cache: 'force-cache' }).then((r) => r.json()).then(normalizeCollection).then((d) => { russiaCache.current.set(e.file!, d); if (!c.signal.aborted) setRussia(d); }).catch(() => undefined); return () => c.abort();
  }, [manifest, polityId]);
  return { index, world, worldYear, russia };
}

function makeTexture(ctx: CanvasRenderingContext2D) {
  const tile = document.createElement('canvas'); tile.width = 96; tile.height = 96; const t = tile.getContext('2d')!;
  t.clearRect(0, 0, 96, 96); t.strokeStyle = 'rgba(236,220,172,.09)'; t.lineWidth = .7;
  for (let y = 8; y < 96; y += 15) { t.beginPath(); for (let x = -10; x < 110; x += 8) { const yy = y + Math.sin((x + y) * .13) * 3; if (x < 0) t.moveTo(x, yy); else t.lineTo(x, yy); } t.stroke(); }
  t.fillStyle = 'rgba(255,240,190,.08)'; for (let i = 0; i < 34; i++) { const x = (i * 37) % 96; const y = (i * 53) % 96; t.fillRect(x, y, 1, 1); }
  return ctx.createPattern(tile, 'repeat');
}

export function HistoricalTerritoryGlobeCanvas({ initialYear = TERRITORY_MAX_YEAR }: { initialYear?: number }) {
  const sceneRef = useRef<HTMLElement | null>(null); const canvasRef = useRef<HTMLCanvasElement | null>(null); const rafRef = useRef<number | null>(null);
  const [viewport, setViewport] = useState({ width: 1600, height: 900 }); const [year, setYear] = useState(clamp(initialYear, TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR));
  const [viewMode, setViewMode] = useState<ViewMode>('globe'); const [rotation, setRotation] = useState<Rotation>([-64, -48, 0]); const [zoom, setZoom] = useState(1.45); const [fullscreen, setFullscreen] = useState(false); const [showBorders, setShowBorders] = useState(true);
  const drag = useRef({ active: false, x: 0, y: 0, rotation: [-64, -48, 0] as Rotation }); const pointers = useRef(new Map<number, Point>()); const pinch = useRef<{ d: number; zoom: number } | null>(null);
  const period = territoryPeriodAt(year); const { index, world, worldYear, russia } = useData(year, period.polityId); const portrait = viewport.height > viewport.width * 1.08;
  const russiaFeatures = useMemo(() => selectRussia(russia, year), [russia, year]); const russiaCollection = useMemo<AnyCollection>(() => ({ type: 'FeatureCollection', features: russiaFeatures }), [russiaFeatures]);

  useEffect(() => { const n = sceneRef.current; if (!n) return; const update = () => { const r = n.getBoundingClientRect(); if (r.width && r.height) setViewport({ width: Math.round(r.width), height: Math.round(r.height) }); }; update(); const ro = new ResizeObserver(update); ro.observe(n); return () => ro.disconnect(); }, []);
  const projection = useMemo<GeoProjection>(() => {
    const { width, height } = viewport;
    if (viewMode === 'map') return geoNaturalEarth1().translate([width / 2, height * (portrait ? .45 : .5)]).scale(Math.min(width / 5.6, height / 3.15) * zoom).precision(.8);
    const radius = portrait ? Math.min(width * .48, height * .32) : Math.min(width * .34, height * .46);
    return geoOrthographic().translate([width * (portrait ? .5 : .62), height * (portrait ? .44 : .5)]).scale(radius * zoom).rotate(rotation).clipAngle(90).precision(.9);
  }, [portrait, rotation, viewMode, viewport, zoom]);

  const labels = useMemo(() => {
    const c: Label[] = []; const center: [number, number] = [-rotation[0], -rotation[1]]; const mobile = portrait;
    if (russiaFeatures.length) { const g = geoCentroid(russiaCollection as never); const p = projection(g); if (p && (viewMode !== 'globe' || geoDistance(g, center) < Math.PI / 2 - .05)) c.push({ text: period.label, x: p[0], y: p[1], size: mobile ? 17 : 21, priority: 100000, kind: 'russia' }); }
    if (world) {
      const tmp = document.createElement('canvas').getContext('2d')!; const gp = geoPath(projection, tmp as never); const candidates: Label[] = [];
      world.features.forEach((f) => { const n = featureName(f); if (!n || /russia|russian|росси/i.test(n)) return; const g = geoCentroid(f as never); if (viewMode === 'globe' && geoDistance(g, center) > Math.PI / 2 - .06) return; const p = projection(g); if (!p) return; const a = geoArea(f as never); const size = clamp(10 + Math.sqrt(a) * 8, mobile ? 11 : 12, mobile ? 15 : 19); candidates.push({ text: COUNTRY_NAME_RU[n] ?? n, x: p[0], y: p[1], size, priority: 1000 + a * 10000, kind: 'country' }); void gp; });
      candidates.sort((a, b) => b.priority - a.priority); c.push(...candidates.slice(0, mobile ? (zoom < 2 ? 7 : 11) : 18));
    }
    const places: Label[] = [];
    for (const p of TERRITORY_PLACES) {
      if ((p.from ?? TERRITORY_MIN_YEAR) > year || (p.to ?? TERRITORY_MAX_YEAR) < year) continue;
      if (mobile && p.kind === 'regional' && zoom < 2.8) continue; if (!mobile && p.kind === 'regional' && zoom < 1.8) continue;
      if (viewMode === 'globe' && geoDistance([p.lon, p.lat], center) > Math.PI / 2 - .06) continue; const q = projection([p.lon, p.lat]); if (!q) continue;
      places.push({ text: p.name, x: q[0], y: q[1], size: p.kind === 'capital' ? (mobile ? 11 : 12) : 10, priority: p.kind === 'capital' ? 700 : 250, kind: p.kind });
    }
    places.sort((a, b) => b.priority - a.priority); c.push(...places.slice(0, mobile ? (zoom < 2 ? 4 : zoom < 3 ? 8 : 16) : 30));
    return acceptLabels(c, viewport.width, viewport.height, portrait);
  }, [period.label, portrait, projection, rotation, russiaCollection, russiaFeatures.length, viewMode, viewport.height, viewport.width, world, year, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return; const dpr = Math.min(window.devicePixelRatio || 1, portrait ? 1.35 : 1.75); const { width, height } = viewport;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; }
    const ctx = canvas.getContext('2d', { alpha: true })!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); const path = geoPath(projection, ctx as never);
    const ocean = ctx.createRadialGradient(width * .42, height * .32, 10, width * .52, height * .48, Math.max(width, height) * .7); ocean.addColorStop(0, '#153744'); ocean.addColorStop(.48, '#08222d'); ocean.addColorStop(1, '#020d13');
    ctx.beginPath(); path(sphere as never); ctx.fillStyle = viewMode === 'globe' ? ocean : '#07171e'; ctx.fill();
    ctx.beginPath(); path(graticule as never); ctx.strokeStyle = 'rgba(171,194,191,.09)'; ctx.lineWidth = .55; ctx.stroke();

    const land = document.createElement('canvas'); land.width = canvas.width; land.height = canvas.height; const lc = land.getContext('2d')!; lc.setTransform(dpr, 0, 0, dpr, 0, 0); const lp = geoPath(projection, lc as never);
    (world?.features ?? []).forEach((f, i) => { lc.beginPath(); lp(f as never); lc.fillStyle = colorFor(f, i); lc.fill(); if (showBorders) { lc.strokeStyle = 'rgba(232,220,188,.42)'; lc.lineWidth = .55; lc.stroke(); } });
    const pattern = makeTexture(lc); if (pattern) { lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = pattern; lc.fillRect(0, 0, width, height); lc.globalCompositeOperation = 'source-over'; const light = lc.createLinearGradient(0, 0, width, height); light.addColorStop(0, 'rgba(255,235,180,.14)'); light.addColorStop(.48, 'rgba(255,255,255,0)'); light.addColorStop(1, 'rgba(0,0,0,.24)'); lc.fillStyle = light; lc.globalCompositeOperation = 'source-atop'; lc.fillRect(0, 0, width, height); lc.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(land, 0, 0, width, height);
    if (russiaFeatures.length) { ctx.beginPath(); path(russiaCollection as never); ctx.fillStyle = '#35563b'; ctx.fill(); ctx.strokeStyle = '#e2c56f'; ctx.lineWidth = .9; ctx.stroke(); ctx.save(); ctx.clip(); const rg = ctx.createLinearGradient(width * .25, height * .25, width * .8, height * .8); rg.addColorStop(0, 'rgba(198,205,135,.18)'); rg.addColorStop(.5, 'rgba(39,82,50,.02)'); rg.addColorStop(1, 'rgba(0,0,0,.24)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, width, height); ctx.restore(); }
    if (viewMode === 'globe') { ctx.beginPath(); path(sphere as never); ctx.strokeStyle = 'rgba(226,207,156,.6)'; ctx.lineWidth = .9; ctx.stroke(); }

    ctx.textBaseline = 'middle';
    for (const l of labels) {
      if (l.kind === 'capital') { ctx.fillStyle = '#f7e5ae'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? 2.4 : 5.2; const x = l.x + Math.cos(a) * r; const y = l.y + Math.sin(a) * r; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); ctx.fill(); }
      else if (l.kind === 'regional') { ctx.beginPath(); ctx.arc(l.x, l.y, 2.2, 0, Math.PI * 2); ctx.fillStyle = '#f2e5bd'; ctx.fill(); }
      ctx.font = `${l.kind === 'russia' ? 500 : 400} ${l.size}px Georgia, 'Times New Roman', serif`; ctx.textAlign = l.kind === 'capital' || l.kind === 'regional' ? 'left' : 'center'; const tx = l.x + (l.kind === 'capital' ? 8 : l.kind === 'regional' ? 6 : 0);
      ctx.lineWidth = l.kind === 'russia' ? 3 : 2; ctx.strokeStyle = 'rgba(3,10,13,.78)'; ctx.strokeText(l.text, tx, l.y); ctx.fillStyle = l.kind === 'russia' ? '#f2e5bd' : '#eee4cb'; ctx.fillText(l.text, tx, l.y);
    }
  }, [labels, portrait, projection, russiaCollection, russiaFeatures.length, showBorders, viewMode, viewport, world]);

  useEffect(() => { if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(draw); return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }; }, [draw]);
  const focusRussia = useCallback(() => { const [lon, lat] = period.focus; setRotation([-lon, -lat, 0]); setZoom(viewMode === 'globe' ? 1.45 : 1.12); }, [period.focus, viewMode]);
  useEffect(() => { focusRussia(); }, [period.polityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => setFullscreen(Boolean(document.fullscreenElement)); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  const zoomBounds = viewMode === 'globe' ? [.9, 9] as const : [.75, 7] as const;
  const changeZoom = (d: number) => setZoom((z) => clamp(z + d, zoomBounds[0], zoomBounds[1]));
  function pointerDown(e: React.PointerEvent<HTMLCanvasElement>) { e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const a = [...pointers.current.values()]; if (a.length >= 2) { pinch.current = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), zoom }; drag.current.active = false; return; } drag.current = { active: true, x: e.clientX, y: e.clientY, rotation }; }
  function pointerMove(e: React.PointerEvent<HTMLCanvasElement>) { if (!pointers.current.has(e.pointerId)) return; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const a = [...pointers.current.values()]; if (a.length >= 2) { const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (!pinch.current) pinch.current = { d, zoom }; setZoom(clamp(pinch.current.zoom * d / Math.max(24, pinch.current.d), zoomBounds[0], zoomBounds[1])); return; } if (!drag.current.active || viewMode !== 'globe') return; const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; const s = .17 / zoom; const next: Rotation = [drag.current.rotation[0] + dx * s, clamp(drag.current.rotation[1] - dy * s, -78, 78), 0]; if (rafRef.current) cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(() => setRotation(next)); }
  function pointerUp(e: React.PointerEvent<HTMLCanvasElement>) { pointers.current.delete(e.pointerId); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); if (pointers.current.size < 2) pinch.current = null; drag.current.active = false; }
  const snapshots = useMemo(() => { const ys = new Set(POLITY_TRANSITION_YEARS); for (const s of index?.snapshots ?? []) ys.add(s.year); ys.add(TERRITORY_MAX_YEAR); return [...ys].filter((y) => y >= TERRITORY_MIN_YEAR && y <= TERRITORY_MAX_YEAR).sort((a, b) => a - b); }, [index]);
  const jump = (dir: -1 | 1) => { const a = dir > 0 ? snapshots.filter((y) => y > year) : snapshots.filter((y) => y < year).reverse(); if (a.length) setYear(a[0]); };
  const toggleFullscreen = async () => { if (!sceneRef.current) return; if (document.fullscreenElement) await document.exitFullscreen(); else await sceneRef.current.requestFullscreen(); };

  return <main className={`${styles.page} premiumTerritoryPage`}><section ref={sceneRef} className={`${styles.scene} premiumTerritoryScene`}>
    <div className={styles.space} aria-hidden="true" />
    <canvas ref={canvasRef} className={`${styles.globe} ${styles.globeInteractive}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(e) => { e.preventDefault(); changeZoom(e.deltaY > 0 ? -.28 : .28); }} />
    <header className={styles.topbar}><div className={styles.brand}><span className={styles.brandSymbol}>Р</span><div><strong>Правители России</strong><span>Исторический глобус</span></div></div><div className={styles.topControls}><div className={styles.segmented}><button className={viewMode === 'globe' ? styles.active : ''} onClick={() => setViewMode('globe')}>Глобус</button><button className={viewMode === 'map' ? styles.active : ''} onClick={() => setViewMode('map')}>Карта</button></div><button className={styles.controlButton} onClick={focusRussia}>К России</button><button className={styles.controlButton} onClick={toggleFullscreen}>{fullscreen ? 'Свернуть' : 'На весь экран'}</button></div></header>
    <aside className={styles.story}><div className={styles.eyebrow}>{period.era}</div><div className={styles.storyRow}><h1>{period.label}</h1><span className={styles.storyYear}>{year}</span></div><p>Исторический мировой срез {worldYear ?? '—'} года · локальная база исторических границ.</p></aside>
    <div className={styles.mapTools}><button onClick={() => changeZoom(.45)} aria-label="Приблизить">+</button><button onClick={() => changeZoom(-.45)} aria-label="Отдалить">−</button><button onClick={() => setShowBorders((v) => !v)} className={showBorders ? styles.toolActive : ''} aria-label="Границы государств">◎</button></div>
    <section className={styles.timeline}><div className={styles.timelineTop}><button onClick={() => jump(-1)}>‹</button><div><strong>{period.shortLabel}</strong><span>{TERRITORY_MIN_YEAR} — {TERRITORY_MAX_YEAR}</span></div><div className={styles.timelineCurrent}>{year}</div><button onClick={() => jump(1)}>›</button></div><div className={styles.rangeRow}><span>{TERRITORY_MIN_YEAR}</span><div className={styles.rangeTrack}><input type="range" min={TERRITORY_MIN_YEAR} max={TERRITORY_MAX_YEAR} step={1} value={year} onChange={(e) => setYear(clamp(Number(e.target.value), TERRITORY_MIN_YEAR, TERRITORY_MAX_YEAR))} /><div className={styles.marks}>{snapshots.map((v) => <i key={v} style={{ left: `${((v - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100}%` }} />)}</div></div><span>{TERRITORY_MAX_YEAR}</span></div></section>
  </section></main>;
}
