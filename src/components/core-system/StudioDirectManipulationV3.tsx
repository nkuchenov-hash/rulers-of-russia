'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

const LAYOUT_STORAGE_KEY = 'rulers-of-russia:studio:element-layout:v1';
const DIRECT_STORAGE_KEY = 'rulers-of-russia:studio:direct-layout:v1';

export const STUDIO_DIRECT_LAYOUT_STORAGE_KEY = DIRECT_STORAGE_KEY;

type DimensionValue = { value: number; unit: 'auto' | 'px' | '%' };
type ElementLayoutOverride = {
  width?: DimensionValue;
  height?: DimensionValue;
  order?: number;
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: 'auto' | 'stretch' | 'flex-start' | 'center' | 'flex-end';
};
type LayoutStore = Record<string, ElementLayoutOverride>;
type DirectOverride = {
  marginLeft?: number;
  marginTop?: number;
  flexBasis?: number;
  fixedFlex?: boolean;
};
type DirectStore = Record<string, DirectOverride>;
type StylableElement = HTMLElement | SVGElement;
type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type Box = { left: number; top: number; width: number; height: number };

type FlexContext = {
  parent: HTMLElement;
  axis: 'row' | 'column';
} | null;

function isStylable(value: Element | null): value is StylableElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function readJson<T>(storageKey: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storageKey: string, value: unknown) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Direct editing still works for this session when storage is unavailable.
  }
}

function occurrence(target: Element, selector: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll(selector)).indexOf(target);
}

/* Keep the same keys as StudioElementControls. */
function keyFor(target: Element): string | null {
  const cardId = target.getAttribute('data-card-id');
  if (cardId) return `card:${cardId}`;

  const moduleId = target.getAttribute('data-module-id');
  if (moduleId) return `module:${moduleId}`;

  const elementId = target.getAttribute('data-element-id');
  if (!elementId) return null;

  const card = target.closest('[data-card-id]');
  if (card) {
    const owner = card.getAttribute('data-card-id');
    const index = occurrence(target, `[data-element-id="${elementId}"]`, card);
    return `card:${owner}:element:${elementId}:${Math.max(0, index)}`;
  }

  const index = occurrence(target, `[data-element-id="${elementId}"]`);
  return `element:${elementId}:${Math.max(0, index)}`;
}

function targetFromKey(key: string): StylableElement | null {
  const parts = key.split(':');
  if (parts[0] === 'module' && parts[1]) {
    const node = document.querySelector(`[data-module-id="${parts[1]}"]`);
    return isStylable(node) ? node : null;
  }
  if (parts[0] === 'card' && parts[1] && parts.length === 2) {
    const node = document.querySelector(`[data-card-id="${parts[1]}"]`);
    return isStylable(node) ? node : null;
  }
  if (parts[0] === 'card' && parts[1] && parts[2] === 'element' && parts[3]) {
    const card = document.querySelector(`[data-card-id="${parts[1]}"]`);
    const node = card?.querySelectorAll(`[data-element-id="${parts[3]}"]`)[Number(parts[4] ?? 0)] ?? null;
    return isStylable(node) ? node : null;
  }
  if (parts[0] === 'element' && parts[1]) {
    const node = document.querySelectorAll(`[data-element-id="${parts[1]}"]`)[Number(parts[2] ?? 0)] ?? null;
    return isStylable(node) ? node : null;
  }
  return null;
}

function nameFor(target: Element) {
  return target.getAttribute('data-card-id')
    ?? target.getAttribute('data-module-id')
    ?? target.getAttribute('data-element-id')
    ?? target.tagName.toLowerCase();
}

function important(target: StylableElement, property: string, value: string) {
  target.style.setProperty(property, value, 'important');
}

function measureBox(target: StylableElement): Box {
  const rect = target.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function flexContext(target: StylableElement): FlexContext {
  const parent = target.parentElement;
  if (!parent) return null;
  const style = getComputedStyle(parent);
  if (style.display !== 'flex' && style.display !== 'inline-flex') return null;
  return {
    parent,
    axis: style.flexDirection.startsWith('column') ? 'column' : 'row'
  };
}

function applySize(target: StylableElement, width?: number, height?: number) {
  if (target instanceof HTMLElement && getComputedStyle(target).display === 'inline') {
    important(target, 'display', 'inline-block');
  }
  if (width !== undefined) {
    important(target, 'width', `${Math.max(24, width)}px`);
    important(target, 'min-width', '0');
    important(target, 'max-width', 'none');
  }
  if (height !== undefined) {
    important(target, 'height', `${Math.max(24, height)}px`);
    important(target, 'min-height', '0');
    important(target, 'max-height', 'none');
  }
}

function applyFixedBasis(target: StylableElement, basis: number) {
  important(target, 'flex-basis', `${Math.max(24, basis)}px`);
  important(target, 'flex-grow', '0');
  important(target, 'flex-shrink', '0');
}

function persistSize(key: string, width?: number, height?: number, fixedFlex = false) {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  store[key] = {
    ...(store[key] ?? {}),
    ...(width !== undefined ? { width: { value: Math.round(width), unit: 'px' } as DimensionValue } : {}),
    ...(height !== undefined ? { height: { value: Math.round(height), unit: 'px' } as DimensionValue } : {}),
    ...(fixedFlex ? { flexGrow: 0, flexShrink: 0 } : {})
  };
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function persistDirect(key: string, patch: DirectOverride) {
  const store = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
  store[key] = { ...(store[key] ?? {}), ...patch };
  writeJson(DIRECT_STORAGE_KEY, store);
}

function restoreDirect() {
  const store = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
  Object.entries(store).forEach(([key, override]) => {
    const target = targetFromKey(key);
    if (!target) return;
    if (override.marginLeft !== undefined) important(target, 'margin-left', `${override.marginLeft}px`);
    if (override.marginTop !== undefined) important(target, 'margin-top', `${override.marginTop}px`);
    if (override.flexBasis !== undefined) {
      important(target, 'flex-basis', `${override.flexBasis}px`);
      if (override.fixedFlex) {
        important(target, 'flex-grow', '0');
        important(target, 'flex-shrink', '0');
      }
    }
  });
}

function makePrimaryRowAddressable() {
  const row = document.querySelector('.primary-content-row');
  if (row && !row.hasAttribute('data-element-id')) row.setAttribute('data-element-id', 'primary-content-row');
}

function flowChildren(container: HTMLElement): StylableElement[] {
  return Array.from(container.children).filter((child): child is StylableElement => isStylable(child) && Boolean(keyFor(child)));
}

function ensureFlow(container: HTMLElement, children: StylableElement[]) {
  const computed = getComputedStyle(container);
  if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(computed.display)) return;
  if (children.length < 2) return;
  const a = children[0].getBoundingClientRect();
  const b = children[1].getBoundingClientRect();
  const row = Math.abs(b.left - a.left) > Math.abs(b.top - a.top);
  important(container, 'display', 'flex');
  important(container, 'flex-direction', row ? 'row' : 'column');
  important(container, 'flex-wrap', row ? 'wrap' : 'nowrap');
  important(container, 'align-items', 'stretch');
  container.setAttribute('data-studio-flow-converted', 'true');
}

function persistOrder(children: StylableElement[]) {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  children.forEach((child, index) => {
    const key = keyFor(child);
    if (!key) return;
    store[key] = { ...(store[key] ?? {}), order: index };
    important(child, 'order', String(index));
  });
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function restoreOrderFlows() {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  Object.entries(store).forEach(([key, override]) => {
    if (override.order === undefined) return;
    const target = targetFromKey(key);
    const parent = target?.parentElement;
    if (!target || !parent) return;
    ensureFlow(parent, flowChildren(parent));
  });
}

function sortedChildren(container: HTMLElement) {
  return flowChildren(container).sort((a, b) => {
    const oa = Number.parseFloat(getComputedStyle(a).order || '0');
    const ob = Number.parseFloat(getComputedStyle(b).order || '0');
    if (oa !== ob) return oa - ob;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
    return ra.left - rb.left;
  });
}

function insertionIndex(children: StylableElement[], x: number, y: number) {
  for (let index = 0; index < children.length; index += 1) {
    const rect = children[index].getBoundingClientRect();
    const sameBand = y >= rect.top - 12 && y <= rect.bottom + 12;
    if (y < rect.top + rect.height / 2 || (sameBand && x < rect.left + rect.width / 2)) return index;
  }
  return children.length;
}

export function StudioDirectManipulationV3() {
  const selectedRef = useRef<StylableElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [selectedKey, setSelectedKey] = useState('module:hero');
  const [selectedName, setSelectedName] = useState('hero');
  const [selectedBox, setSelectedBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const sizeLabel = useMemo(
    () => selectedBox ? `${Math.round(selectedBox.width)} × ${Math.round(selectedBox.height)}` : '',
    [selectedBox]
  );

  function scheduleMeasure(target = selectedRef.current) {
    if (!target) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (target.isConnected) setSelectedBox(measureBox(target));
    });
  }

  function select(target: Element | null) {
    if (!isStylable(target)) return;
    const key = keyFor(target);
    if (!key) return;
    selectedRef.current = target;
    setSelectedKey(key);
    setSelectedName(nameFor(target));
    setSelectedBox(measureBox(target));
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => scheduleMeasure(target));
    resizeObserverRef.current.observe(target);
  }

  function resetSelected() {
    const layout = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
    delete layout[selectedKey];
    writeJson(LAYOUT_STORAGE_KEY, layout);
    const direct = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
    delete direct[selectedKey];
    writeJson(DIRECT_STORAGE_KEY, direct);
    window.location.reload();
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, handle: Handle) {
    const target = selectedRef.current;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    const start = target.getBoundingClientRect();
    const computed = getComputedStyle(target);
    const context = flexContext(target);
    const horizontal = handle.includes('e') || handle.includes('w');
    const vertical = handle.includes('n') || handle.includes('s');
    const mainAxisResize = Boolean(context && ((context.axis === 'row' && horizontal) || (context.axis === 'column' && vertical)));
    const startX = event.clientX;
    const startY = event.clientY;
    const startMarginLeft = Number.parseFloat(computed.marginLeft) || 0;
    const startMarginTop = Number.parseFloat(computed.marginTop) || 0;
    let finalWidth = start.width;
    let finalHeight = start.height;
    let finalMarginLeft = startMarginLeft;
    let finalMarginTop = startMarginTop;
    let finalBasis = context?.axis === 'column' ? start.height : start.width;

    setResizing(true);
    document.body.setAttribute('data-studio-resizing', 'true');

    const move = (pointer: PointerEvent) => {
      const dx = pointer.clientX - startX;
      const dy = pointer.clientY - startY;
      let width = start.width;
      let height = start.height;
      let marginLeft = startMarginLeft;
      let marginTop = startMarginTop;

      if (handle.includes('e')) width = Math.max(24, start.width + dx);
      if (handle.includes('w')) {
        width = Math.max(24, start.width - dx);
        marginLeft = startMarginLeft + start.width - width;
      }
      if (handle.includes('s')) height = Math.max(24, start.height + dy);
      if (handle.includes('n')) {
        height = Math.max(24, start.height - dy);
        marginTop = startMarginTop + start.height - height;
      }

      finalWidth = width;
      finalHeight = height;
      finalMarginLeft = marginLeft;
      finalMarginTop = marginTop;
      finalBasis = context?.axis === 'column' ? height : width;

      applySize(target, horizontal ? width : undefined, vertical ? height : undefined);
      if (mainAxisResize) applyFixedBasis(target, finalBasis);
      if (handle.includes('w')) important(target, 'margin-left', `${marginLeft}px`);
      if (handle.includes('n')) important(target, 'margin-top', `${marginTop}px`);
      scheduleMeasure(target);
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setResizing(false);
      document.body.removeAttribute('data-studio-resizing');
      persistSize(selectedKey, horizontal ? finalWidth : undefined, vertical ? finalHeight : undefined, mainAxisResize);
      persistDirect(selectedKey, {
        ...(handle.includes('w') ? { marginLeft: finalMarginLeft } : {}),
        ...(handle.includes('n') ? { marginTop: finalMarginTop } : {}),
        ...(mainAxisResize ? { flexBasis: Math.round(finalBasis), fixedFlex: true } : {})
      });
      scheduleMeasure(target);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const target = selectedRef.current;
    const parent = target?.parentElement;
    if (!target || !parent) return;
    const children = flowChildren(parent);
    if (children.length < 2 || !children.includes(target)) return;

    event.preventDefault();
    event.stopPropagation();
    ensureFlow(parent, children);

    const startX = event.clientX;
    const startY = event.clientY;
    let active = false;
    let lastIndex = -1;

    const move = (pointer: PointerEvent) => {
      if (!active && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 4) return;
      if (!active) {
        active = true;
        setDragging(true);
        document.body.setAttribute('data-studio-dragging', 'true');
        target.setAttribute('data-studio-moving', 'true');
      }
      const rest = sortedChildren(parent).filter((child) => child !== target);
      const index = insertionIndex(rest, pointer.clientX, pointer.clientY);
      if (index === lastIndex) return;
      lastIndex = index;
      const ordered = [...rest];
      ordered.splice(index, 0, target);
      persistOrder(ordered);
      scheduleMeasure(target);
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!active) return;
      setDragging(false);
      document.body.removeAttribute('data-studio-dragging');
      target.removeAttribute('data-studio-moving');
      scheduleMeasure(target);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  useEffect(() => {
    setMounted(true);
    makePrimaryRowAddressable();
    restoreDirect();
    restoreOrderFlows();

    const sync = () => {
      makePrimaryRowAddressable();
      const selected = document.querySelector('.is-inspector-selected')
        ?? document.querySelector('[data-module-id="hero"]');
      if (selected && selected !== selectedRef.current) select(selected);
      else scheduleMeasure();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    const viewport = () => scheduleMeasure();
    window.addEventListener('resize', viewport);
    window.addEventListener('scroll', viewport, true);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('resize', viewport);
      window.removeEventListener('scroll', viewport, true);
    };
  }, []);

  if (!mounted || !selectedBox || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`studio-direct-frame ${dragging ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''}`}
      data-studio-direct-frame="true"
      style={{ left: selectedBox.left, top: selectedBox.top, width: selectedBox.width, height: selectedBox.height }}
    >
      <div className="studio-direct-label">
        <button type="button" className="studio-direct-grip" onPointerDown={beginDrag} title="Переместить в auto-layout">
          <span aria-hidden="true">⠿</span><b>{selectedName}</b><em>{sizeLabel}</em>
        </button>
        <button type="button" className="studio-direct-reset" onClick={resetSelected} title="Сбросить размер и положение">↺</button>
      </div>
      {(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as Handle[]).map((handle) => (
        <button
          type="button"
          key={handle}
          aria-label={`Resize ${handle}`}
          data-studio-resize-handle={handle}
          className={`studio-direct-resize studio-direct-resize-${handle}`}
          onPointerDown={(pointer) => beginResize(pointer, handle)}
        />
      ))}
    </div>,
    document.body
  );
}
