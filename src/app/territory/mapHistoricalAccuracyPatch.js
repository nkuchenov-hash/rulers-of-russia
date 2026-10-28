import * as THREE from 'three';
import {LineSegments2} from 'three/examples/jsm/lines/LineSegments2.js';
import {historicalGeometryCaveat} from './historicalGeometryCaveats.mjs';

// Accuracy guard for the production /territory globe.
//
// 1. Never fall back from History Core to the legacy bootstrap archive.
// 2. Historical Basemaps world snapshots are contextual. When the snapshot year
//    differs from the selected year, visually soften the border and label the
//    temporal offset instead of presenting it as an exact-year border.
// 3. A document-corroborated reconstruction with a material uncertainty envelope
//    stays visibly approximate after History Core completion certification.

const PATCH_KEY = Symbol.for('rulers-of-russia.map-historical-accuracy.v1');
const STATE_KEY = Symbol.for('rulers-of-russia.map-historical-accuracy.state.v1');
const LEGACY_MANIFEST_RE = /\/data\/territory\/archive\/manifest\.json(?:\?|$)/;
const MONTH_INDEX_RE = /\/data\/history-core\/generated\/month-index\.json(?:\?|$)/;
const WORLD_SNAPSHOT_RE = /\/data\/territory\/world-history\/snapshots\/(\d+)\.geojson(?:\?|$)/;
const MATERIAL_UNCERTAINTY_METERS = 25000;
const CAPTION_ATTR = 'data-history-accuracy-caption';
const MOBILE_CAPTION_ATTR = 'data-history-mobile-caption';
const CAPTION_STYLE_ID = 'history-accuracy-caption-style';

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {'content-type': 'application/json; charset=utf-8'},
  });
}

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? '';
}

function selectedDate() {
  if (typeof document === 'undefined') return null;
  const storyDate = document.querySelector('main aside b');
  const text = storyDate?.textContent ?? '';
  const yearMatch = text.match(/(-?\d{3,4})\s*$/);
  const monthSelect = document.querySelector('select[aria-label="Месяц"]');
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const month = Number(monthSelect?.value ?? NaN);
  return Number.isFinite(year) && Number.isFinite(month) ? {year, month} : null;
}

function monthKey(date) {
  return date ? `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}` : null;
}

function activeMonthState(state) {
  const selected = selectedDate();
  const key = monthKey(selected);
  if (!selected || !key || !state.monthIndex?.months?.length) return null;
  const min = state.monthIndex.minMonth;
  if (/^\d{4}-\d{2}$/.test(min ?? '')) {
    const minYear = Number(min.slice(0, 4));
    const minMonth = Number(min.slice(5, 7));
    const offset = (selected.year - minYear) * 12 + (selected.month - minMonth);
    const item = state.monthIndex.months[offset];
    if (item?.month === key) return item;
  }
  return state.monthIndex.months.find((item) => item.month === key) ?? null;
}

function uncertaintyProfile(item) {
  const meters = Number(item?.uncertaintyMeters ?? 0);
  const reconstruction = item?.verificationClass === 'document-corroborated-reconstruction';
  if (!reconstruction || !Number.isFinite(meters) || meters < MATERIAL_UNCERTAINTY_METERS) return null;
  const km = meters / 1000;
  return {
    meters,
    km,
    haloWidth: Math.min(18, 5.5 + Math.log10(Math.max(1, km / 25)) * 4.2),
    haloOpacity: Math.min(.22, .10 + Math.log10(Math.max(1, km / 25)) * .055),
    lineOpacity: km >= 200 ? .62 : km >= 100 ? .70 : .78,
  };
}

function softenApproximateWorldBorder(object, state) {
  if (object?.userData?.kind !== 'world-border') return;
  const selected = selectedDate();
  const snapshotYear = state.worldSnapshotYear;
  if (!selected || !Number.isFinite(snapshotYear) || snapshotYear === selected.year) return;
  object.userData.temporalContextOnly = true;
  object.userData.snapshotYear = snapshotYear;
  object.userData.selectedYear = selected.year;
  if (object.material) {
    object.material.opacity = Math.min(Number(object.material.opacity ?? 1), .48);
    object.material.linewidth = Math.min(Number(object.material.linewidth ?? 2), 1.35);
    object.material.needsUpdate = true;
  }
}

function certifiedUncertaintyHalo(object, state) {
  if (object?.userData?.kind !== 'russia-border') return null;
  const profile = uncertaintyProfile(activeMonthState(state));
  if (!profile || !object.geometry || !object.material) return null;

  object.userData.certifiedReconstructionUncertaintyMeters = profile.meters;
  object.material.opacity = Math.min(Number(object.material.opacity ?? 1), profile.lineOpacity);
  object.material.needsUpdate = true;

  const geometry = object.geometry.clone();
  const material = object.material.clone();
  material.linewidth = profile.haloWidth;
  material.opacity = profile.haloOpacity;
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
  const halo = new LineSegments2(geometry, material);
  halo.computeLineDistances();
  halo.renderOrder = Math.max(0, Number(object.renderOrder ?? 7) - .08);
  halo.userData = {
    kind: 'russia-certified-uncertainty',
    uncertaintyMeters: profile.meters,
    verificationClass: 'document-corroborated-reconstruction',
  };
  return halo;
}

function ensureCaptionStyle() {
  if (typeof document === 'undefined' || document.getElementById(CAPTION_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CAPTION_STYLE_ID;
  style.textContent = `
    main aside p[${CAPTION_ATTR}] { font-size: 0 !important; }
    main aside p[${CAPTION_ATTR}]::after {
      content: attr(${CAPTION_ATTR});
      font-size: 16px;
      line-height: 1.45;
      letter-spacing: normal;
    }
    @media (max-width: 720px) {
      main aside p[${CAPTION_ATTR}] {
        display: block !important;
        box-sizing: border-box;
        max-width: min(300px, calc(100vw - 112px));
        padding: 10px 12px;
        margin-top: 12px;
        background: rgba(2, 12, 16, .9);
        border-left: 2px solid #c8ab66;
      }
      main aside p[${CAPTION_ATTR}]::after {
        content: attr(${MOBILE_CAPTION_ATTR});
        display: block;
        font-size: 16px;
        line-height: 1.35;
      }
    }
  `;
  document.head.appendChild(style);
}

function updateAccuracyCaption(state) {
  if (typeof document === 'undefined') return;
  const paragraph = document.querySelector('main aside p');
  if (!paragraph) return;
  const selected = selectedDate();
  let text = paragraph.textContent ?? '';

  text = text.replace('аварийный архивный fallback', 'History Core: геометрия недоступна — граница России скрыта');

  if (selected && Number.isFinite(state.worldSnapshotYear) && state.worldSnapshotYear !== selected.year) {
    const offset = selected.year - state.worldSnapshotYear;
    const exact = `Исторический мировой срез ${state.worldSnapshotYear} года`;
    const replacement = `Мировой контекст: приблизительный срез ${state.worldSnapshotYear} года (${offset > 0 ? `${offset} лет до` : `${Math.abs(offset)} лет после`} выбранной даты)`;
    text = text.replace(exact, replacement);
  }

  const monthState = activeMonthState(state);
  const caveat = historicalGeometryCaveat(selected, monthState);
  const profile = uncertaintyProfile(monthState);
  text = text.replace(/ · неопределённость реконструкции ≈[^·]+(?= ·|$)/g, '');
  if (profile) {
    const rounded = profile.km >= 100 ? Math.round(profile.km / 10) * 10 : Math.round(profile.km);
    text += ` · неопределённость реконструкции ≈${rounded} км`;
  }

  if (caveat) {
    text = text.replace('проверенная геометрия', 'геометрия с непроверенной актуальностью');
    text += ` · ${caveat.desktop}`;
  }

  // A compact but explicit accuracy statement must remain readable on phones.
  // Never hide reconstruction uncertainty behind the desktop-only long caption.
  const mobileParts = [];
  if (text.includes('граница России скрыта')) {
    mobileParts.push('Граница России недоступна');
  } else if (caveat) {
    mobileParts.push(caveat.mobile);
  } else if (monthState?.verificationClass === 'document-corroborated-reconstruction') {
    if (profile) {
      const km = profile.km >= 100 ? Math.round(profile.km / 10) * 10 : Math.round(profile.km);
      mobileParts.push(`Реконструкция · неопределённость ≈${km} км`);
    } else {
      mobileParts.push('Документальная реконструкция границы');
    }
  } else if (monthState?.status === 'geometry-verified') {
    mobileParts.push('Историческая геометрия проверена');
  } else {
    mobileParts.push('Исторические границы пока не проверены');
  }
  if (selected && Number.isFinite(state.worldSnapshotYear) && selected.year !== state.worldSnapshotYear) {
    mobileParts.push(`Мировой фон: приблизительно ${state.worldSnapshotYear} г.`);
  }

  ensureCaptionStyle();
  if (caveat && paragraph.getAttribute('data-history-geometry-gap') !== caveat.code) {
    paragraph.setAttribute('data-history-geometry-gap', caveat.code);
  } else if (!caveat && paragraph.hasAttribute('data-history-geometry-gap')) {
    paragraph.removeAttribute('data-history-geometry-gap');
  }
  const compact = mobileParts.join(' · ');
  if (paragraph.getAttribute(MOBILE_CAPTION_ATTR) !== compact) paragraph.setAttribute(MOBILE_CAPTION_ATTR, compact);
  if (paragraph.getAttribute(CAPTION_ATTR) !== text) paragraph.setAttribute(CAPTION_ATTR, text);
  if (paragraph.getAttribute('aria-label') !== text) paragraph.setAttribute('aria-label', text);
}

if (typeof window !== 'undefined' && !window[PATCH_KEY]) {
  Object.defineProperty(window, PATCH_KEY, {value: true, configurable: false});
  const state = window[STATE_KEY] ?? {monthIndex: null, worldSnapshotYear: null};
  window[STATE_KEY] = state;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function accuracyGuardedFetch(input, init) {
    const url = requestUrl(input);

    if (LEGACY_MANIFEST_RE.test(url)) {
      return jsonResponse({schema_version: 1, polities: [], disabledBy: 'mapHistoricalAccuracyPatch'});
    }

    const worldMatch = url.match(WORLD_SNAPSHOT_RE);
    if (worldMatch) state.worldSnapshotYear = Number(worldMatch[1]);

    const response = await originalFetch(input, init);
    if (MONTH_INDEX_RE.test(url) && response.ok) {
      response.clone().json().then((payload) => {
        state.monthIndex = payload;
        queueMicrotask(() => updateAccuracyCaption(state));
      }).catch(() => {});
    }
    return response;
  };

  const originalAdd = THREE.Group.prototype.add;
  THREE.Group.prototype.add = function accuracyGuardedAdd(...objects) {
    const halos = [];
    for (const object of objects) {
      softenApproximateWorldBorder(object, state);
      const halo = certifiedUncertaintyHalo(object, state);
      if (halo) halos.push(halo);
    }

    // Object3D.add(...many) recursively calls this.add() for each argument.
    // Calling the saved implementation variadically from this patch would then
    // re-enter the patch and generate the same halo forever. Add each object
    // through the original single-object path instead.
    for (const halo of halos) originalAdd.call(this, halo);
    for (const object of objects) originalAdd.call(this, object);

    queueMicrotask(() => updateAccuracyCaption(state));
    return this;
  };

  const observer = new MutationObserver(() => updateAccuracyCaption(state));
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, {subtree: true, childList: true, characterData: true});
    updateAccuracyCaption(state);
  };
  if (document.body) startObserver();
  else window.addEventListener('DOMContentLoaded', startObserver, {once: true});
}
