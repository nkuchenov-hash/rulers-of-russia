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
type DirectStore = Record<string, { marginLeft?: number; marginTop?: number }>;
type StylableElement = HTMLElement | SVGElement;
type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type Box = { left: number; top: number; width: number; height: number };

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
    // Direct editing still works for this session if persistence is blocked.
  }
}

function occurrence(target: Element, selector: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll(selector)).indexOf(target);
}

/* Must match StudioElementControls exactly so numeric Inspector controls and
   direct manipulation write to one layout source of truth. */
function targetKey(target: Element): string | null {
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

function label(target: Element) {
  return target.getAttribute('data-card-id')
    ?? target.getAttribute('data-module-id')
    ?? target.getAttribute('data-element-id')
    ?? target.tagName.toLowerCase();
}

function important(target: StylableElement, property: string, value: string) {
  target.style.setProperty(property, value, 'important');
}

function box(target: StylableElement): Box {
  const rect = target.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
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

function persistSize(key: string, width?: number, height?: number) {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  const current = store[key] ?? {};
  store[key] = {
    ...current,
    ...(width !== undefined ? { width: { value: Math.round(width), unit: 'px' } as DimensionValue } : {}),
    ...(height !== undefined ? { height: { value: Math.round(height), unit: 'px' } as DimensionValue } : {})
  };
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function persistDirect(key: string, patch: { marginLeft?: number; marginTop?: number }) {
  const store = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
  store[key] = { ...(store[key] ?? {}), ...patch };
  writeJson(DIRECT_STORAGE_KEY, store);
}

function restoreDirect() {
  const store = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
  Object.entries(store).forEach(([key, value]) => {
    const target = targetFromKey(key);
    if (!target) return;
    if (value.marginLeft !== undefined) important(target, 'margin-left', `${value.marginLeft}px`);
    if (value.marginTop !== undefined) important(target, 'margin-top', `${value.marginTop}px`);
  });
}

function makePrimaryRowAddressable() {
  const row = document.querySelector('.primary-content-row');
  if (row && !row.hasAttribute('data-element-id')) row.setAttribute('data-element-id', 'primary-content-row');
}

function flowChildren(container: HTMLElement): StylableElement[] {
  return Array.from(container.children).filter((child): child is StylableElement => isStylable(child) && Boolean(targetKey(child)));
}

function flowContainer(target: StylableElement): HTMLElement | null {
  return target.parentElement;
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
  important(container, 'align-items', row ? 'stretch' : 'stretch');
  container.setAttribute('data-studio-flow-converted', 'true');
}

function persistOrder(children: StylableElement[]) {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  children.forEach((child, index) => {
    const childKey = targetKey(child);
    if (!childKey) return;
    store[childKey] = { ...(store[childKey] ?? {}), order: index };
    important(child, 'order', String(index));
  });
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function restoreOrderFlows() {
  const store = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
  Object.entries(store).forEach(([key, override]) => {
    if (override.order === undefined) return;
    const target = targetFromKey(key);
    if (!target) return;
    const parent = flowContainer(target);
    if (!parent) return;
    ensureFlow(parent, flowChildren(parent));
  });
}

function sortedChildren(container: HTMLElement) {
  return flowChildren(container).sort((left, right) => {
    const leftOrder = Number.parseFloat(getComputedStyle(left).order || '0');
    const rightOrder = Number.parseFloat(getComputedStyle(right).order || '0');
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
    return a.left - b.left;
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

export function StudioDirectManipulationV2() {
  const targetRef = useRef<StylableElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [targetKeyState, setTargetKeyState] = useState('module:hero');
  const [targetName, setTargetName] = useState('hero');
  const [targetBox, setTargetBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const sizeLabel = useMemo(
    () => targetBox ? `${Math.round(targetBox.width)} × ${Math.round(targetBox.height)}` : '',
    [targetBox]
  );

  function measure(target = targetRef.current) {
    if (!target) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      if (target.isConnected) setTargetBox(box(target));
    });
  }

  function select(target: Element | null) {
    if (!isStylable(target)) return;
    const key = targetKey(target);
    if (!key) return;
    targetRef.current = target;
    setTargetKeyState(key);
    setTargetName(label(target));
    setTargetBox(box(target));
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => measure(target));
    resizeObserverRef.current.observe(target);
  }

  function resetSelected() {
    const target = targetRef.current;
    if (!target) return;
    const layout = readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
    delete layout[targetKeyState];
    writeJson(LAYOUT_STORAGE_KEY, layout);
    const direct = readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
    delete direct[targetKeyState];
    writeJson(DIRECT_STORAGE_KEY, direct);
    window.location.reload();
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, handle: Handle) {
    const target = targetRef.current;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();

    const start = target.getBoundingClientRect();
    const computed = getComputedStyle(target);
    const startMarginLeft = Number.parseFloat(computed.marginLeft) || 0;
    const startMarginTop = Number.parseFloat(computed.marginTop) || 0;
    const startX = event.clientX;
    const startY = event.clientY;
    let finalWidth = start.width;
    let finalHeight = start.height;
    let finalMarginLeft = startMarginLeft;
    let finalMarginTop = startMarginTop;

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

      applySize(target,
        handle.includes('e') || handle.includes('w') ? width : undefined,
        handle.includes('n') || handle.includes('s') ? height : undefined
      );
      if (handle.includes('w')) important(target, 'margin-left', `${marginLeft}px`);
      if (handle.includes('n')) important(target, 'margin-top', `${marginTop}px`);
      measure(target);
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setResizing(false);
      document.body.removeAttribute('data-studio-resizing');
      persistSize(
        targetKeyState,
        handle.includes('e') || handle.includes('w') ? finalWidth : undefined,
        handle.includes('n') || handle.includes('s') ? finalHeight : undefined
      );
      if (handle.includes('w')) persistDirect(targetKeyState, { marginLeft: finalMarginLeft });
      if (handle.includes('n')) persistDirect(targetKeyState, { marginTop: finalMarginTop });
      measure(target);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const target = targetRef.current;
    if (!target) return;
    const parent = flowContainer(target);
    if (!parent) return;
    const initialChildren = flowChildren(parent);
    if (initialChildren.length < 2 || !initialChildren.includes(target)) return;

    event.preventDefault();
    event.stopPropagation();
    ensureFlow(parent, initialChildren);

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
      const withoutTarget = sortedChildren(parent).filter((child) => child !== target);
      const index = insertionIndex(withoutTarget, pointer.clientX, pointer.clientY);
      if (index === lastIndex) return;
      lastIndex = index;
      const next = [...withoutTarget];
      next.splice(index, 0, target);
      persistOrder(next);
      measure(target);
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (!active) return;
      setDragging(false);
      document.body.removeAttribute('data-studio-dragging');
      target.removeAttribute('data-studio-moving');
      measure(target);
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
      if (selected && selected !== targetRef.current) select(selected);
      else measure();
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    const viewport = () => measure();
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

  if (!mounted || !targetBox || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`studio-direct-frame ${dragging ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''}`}
      data-studio-direct-frame="true"
      style={{ left: targetBox.left, top: targetBox.top, width: targetBox.width, height: targetBox.height }}
    >
      <div className="studio-direct-label">
        <button type="button" className="studio-direct-grip" onPointerDown={beginDrag} title="Переместить в auto-layout">
          <span aria-hidden="true">⠿</span><b>{targetName}</b><em>{sizeLabel}</em>
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
