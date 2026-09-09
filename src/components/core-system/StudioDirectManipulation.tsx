'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';

const LAYOUT_STORAGE_KEY = 'rulers-of-russia:studio:element-layout:v1';
const DIRECT_STORAGE_KEY = 'rulers-of-russia:studio:direct-layout:v1';

export const STUDIO_DIRECT_LAYOUT_STORAGE_KEY = DIRECT_STORAGE_KEY;

type DimensionValue = {
  value: number;
  unit: 'auto' | 'px' | '%';
};

type ElementLayoutOverride = {
  width?: DimensionValue;
  height?: DimensionValue;
  order?: number;
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: 'auto' | 'stretch' | 'flex-start' | 'center' | 'flex-end';
};

type LayoutStore = Record<string, ElementLayoutOverride>;
type DirectOverride = { marginLeft?: number; marginTop?: number };
type DirectStore = Record<string, DirectOverride>;
type StylableElement = HTMLElement | SVGElement;
type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

type OverlayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function isStylableElement(value: Element | null): value is StylableElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Studio remains usable if local storage is unavailable.
  }
}

function readLayoutStore(): LayoutStore {
  return readJson<LayoutStore>(LAYOUT_STORAGE_KEY, {});
}

function readDirectStore(): DirectStore {
  return readJson<DirectStore>(DIRECT_STORAGE_KEY, {});
}

function occurrenceIndex(target: Element, selector: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll(selector)).indexOf(target);
}

function targetKey(target: Element): string | null {
  const ownCardId = target.getAttribute('data-card-id');
  if (ownCardId) return `card:${ownCardId}`;

  const moduleId = target.getAttribute('data-module-id');
  if (moduleId) return `module:${moduleId}`;

  const elementId = target.getAttribute('data-element-id');
  if (!elementId) return null;

  const card = target.closest('[data-card-id]');
  if (card) {
    const cardId = card.getAttribute('data-card-id');
    const index = occurrenceIndex(target, `[data-element-id="${elementId}"]`, card);
    return `card:${cardId}:element:${elementId}:${Math.max(0, index)}`;
  }

  const module = target.closest('[data-module-id]');
  if (module) {
    const moduleId = module.getAttribute('data-module-id');
    const index = occurrenceIndex(target, `[data-element-id="${elementId}"]`, module);
    return `module:${moduleId}:element:${elementId}:${Math.max(0, index)}`;
  }

  const index = occurrenceIndex(target, `[data-element-id="${elementId}"]`);
  return `element:${elementId}:${Math.max(0, index)}`;
}

function targetFromKey(key: string): StylableElement | null {
  const parts = key.split(':');

  if (parts[0] === 'module' && parts[1] && parts.length === 2) {
    const target = document.querySelector(`[data-module-id="${parts[1]}"]`);
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'card' && parts[1] && parts.length === 2) {
    const target = document.querySelector(`[data-card-id="${parts[1]}"]`);
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'card' && parts[1] && parts[2] === 'element' && parts[3]) {
    const card = document.querySelector(`[data-card-id="${parts[1]}"]`);
    const target = card?.querySelectorAll(`[data-element-id="${parts[3]}"]`)[Number(parts[4] ?? 0)] ?? null;
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'module' && parts[1] && parts[2] === 'element' && parts[3]) {
    const module = document.querySelector(`[data-module-id="${parts[1]}"]`);
    const target = module?.querySelectorAll(`[data-element-id="${parts[3]}"]`)[Number(parts[4] ?? 0)] ?? null;
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'element' && parts[1]) {
    const target = document.querySelectorAll(`[data-element-id="${parts[1]}"]`)[Number(parts[2] ?? 0)] ?? null;
    return isStylableElement(target) ? target : null;
  }

  return null;
}

function labelForTarget(target: Element) {
  return target.getAttribute('data-card-id')
    ?? target.getAttribute('data-module-id')
    ?? target.getAttribute('data-element-id')
    ?? target.tagName.toLowerCase();
}

function setImportant(target: StylableElement, property: string, value: string) {
  target.style.setProperty(property, value, 'important');
}

function ensureResizableDisplay(target: StylableElement) {
  if (!(target instanceof HTMLElement)) return;
  const display = window.getComputedStyle(target).display;
  if (display === 'inline') setImportant(target, 'display', 'inline-block');
}

function applySize(target: StylableElement, width?: number, height?: number) {
  ensureResizableDisplay(target);
  if (width !== undefined) {
    setImportant(target, 'width', `${Math.max(24, width)}px`);
    setImportant(target, 'min-width', '0');
    setImportant(target, 'max-width', 'none');
  }
  if (height !== undefined) {
    setImportant(target, 'height', `${Math.max(24, height)}px`);
    setImportant(target, 'min-height', '0');
    setImportant(target, 'max-height', 'none');
  }
}

function persistSize(key: string, width?: number, height?: number) {
  const store = readLayoutStore();
  const current = store[key] ?? {};
  store[key] = {
    ...current,
    ...(width !== undefined ? { width: { value: Math.round(width), unit: 'px' } as DimensionValue } : {}),
    ...(height !== undefined ? { height: { value: Math.round(height), unit: 'px' } as DimensionValue } : {})
  };
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function applyDirectOverride(target: StylableElement, override?: DirectOverride) {
  if (!override) return;
  if (override.marginLeft !== undefined) setImportant(target, 'margin-left', `${override.marginLeft}px`);
  if (override.marginTop !== undefined) setImportant(target, 'margin-top', `${override.marginTop}px`);
}

function persistDirect(key: string, next: DirectOverride) {
  const store = readDirectStore();
  if (next.marginLeft === undefined && next.marginTop === undefined) delete store[key];
  else store[key] = next;
  writeJson(DIRECT_STORAGE_KEY, store);
}

function restoreDirectOverrides() {
  const store = readDirectStore();
  Object.entries(store).forEach(([key, override]) => {
    const target = targetFromKey(key);
    if (target) applyDirectOverride(target, override);
  });
}

function visualFlowContainer(target: StylableElement): HTMLElement | null {
  let parent = target.parentElement;
  if (!parent) return null;

  if (window.getComputedStyle(parent).display === 'contents') {
    parent = parent.parentElement;
  }

  if (!parent) return null;
  if (parent.classList.contains('primary-content-row')) return parent.parentElement;
  return parent;
}

function pageBuilderChildren(container: HTMLElement): StylableElement[] {
  if (container.classList.contains('ruler-content')) {
    const result: StylableElement[] = [];
    Array.from(container.children).forEach((child) => {
      if (child instanceof HTMLElement && child.classList.contains('primary-content-row')) {
        Array.from(child.children).forEach((nested) => {
          if (isStylableElement(nested) && targetKey(nested)) result.push(nested);
        });
        return;
      }
      if (isStylableElement(child) && targetKey(child)) result.push(child);
    });
    return result;
  }

  return Array.from(container.children).filter((child): child is StylableElement => isStylableElement(child) && Boolean(targetKey(child)));
}

function inferFlowDirection(children: StylableElement[]) {
  if (children.length < 2) return 'column';
  const first = children[0].getBoundingClientRect();
  const second = children[1].getBoundingClientRect();
  return Math.abs(second.left - first.left) > Math.abs(second.top - first.top) ? 'row' : 'column';
}

function ensureFlowContainer(container: HTMLElement, children: StylableElement[]) {
  const display = window.getComputedStyle(container).display;
  if (display === 'flex' || display === 'inline-flex' || display === 'grid' || display === 'inline-grid') return;
  if (display === 'contents') return;

  setImportant(container, 'display', 'flex');
  setImportant(container, 'flex-direction', inferFlowDirection(children));
  setImportant(container, 'flex-wrap', 'wrap');
  container.setAttribute('data-studio-flow-converted', 'true');
}

function restoreFlowContainersFromOrders() {
  const store = readLayoutStore();
  Object.entries(store).forEach(([key, override]) => {
    if (override.order === undefined) return;
    const target = targetFromKey(key);
    if (!target) return;
    const container = visualFlowContainer(target);
    if (!container) return;
    const children = pageBuilderChildren(container);
    if (children.length > 1) ensureFlowContainer(container, children);
  });
}

function orderedVisualChildren(container: HTMLElement) {
  return pageBuilderChildren(container).sort((a, b) => {
    const orderA = Number.parseFloat(window.getComputedStyle(a).order || '0');
    const orderB = Number.parseFloat(window.getComputedStyle(b).order || '0');
    if (orderA !== orderB) return orderA - orderB;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
    return ra.left - rb.left;
  });
}

function persistOrder(children: StylableElement[]) {
  const store = readLayoutStore();
  children.forEach((child, index) => {
    const key = targetKey(child);
    if (!key) return;
    const current = store[key] ?? {};
    store[key] = { ...current, order: index };
    setImportant(child, 'order', String(index));
  });
  writeJson(LAYOUT_STORAGE_KEY, store);
}

function insertionIndex(children: StylableElement[], x: number, y: number) {
  if (!children.length) return 0;
  for (let index = 0; index < children.length; index += 1) {
    const rect = children[index].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;
    const sameRow = y >= rect.top - 10 && y <= rect.bottom + 10;
    if (y < centerY - 12 || (sameRow && x < centerX)) return index;
  }
  return children.length;
}

function overlayRect(target: StylableElement): OverlayRect {
  const rect = target.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

export function StudioDirectManipulation() {
  const targetRef = useRef<StylableElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const frameRef = useRef<number>(0);
  const [mounted, setMounted] = useState(false);
  const [key, setKey] = useState('module:hero');
  const [name, setName] = useState('hero');
  const [rect, setRect] = useState<OverlayRect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const sizeLabel = useMemo(() => rect ? `${Math.round(rect.width)} × ${Math.round(rect.height)}` : '', [rect]);

  function scheduleMeasure(target = targetRef.current) {
    if (!target) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      if (target.isConnected) setRect(overlayRect(target));
    });
  }

  function selectTarget(target: Element | null) {
    if (!isStylableElement(target)) return;
    const nextKey = targetKey(target);
    if (!nextKey) return;

    targetRef.current = target;
    setKey(nextKey);
    setName(labelForTarget(target));
    setRect(overlayRect(target));

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => scheduleMeasure(target));
    resizeObserverRef.current.observe(target);
  }

  function resetSelected() {
    const target = targetRef.current;
    if (!target) return;

    const layout = readLayoutStore();
    delete layout[key];
    writeJson(LAYOUT_STORAGE_KEY, layout);

    const direct = readDirectStore();
    delete direct[key];
    writeJson(DIRECT_STORAGE_KEY, direct);

    ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'order', 'margin-left', 'margin-top'].forEach((property) => {
      target.style.removeProperty(property);
    });

    window.location.reload();
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, handle: ResizeHandle) {
    const target = targetRef.current;
    if (!target) return;

    event.preventDefault();
    event.stopPropagation();

    const start = target.getBoundingClientRect();
    const computed = window.getComputedStyle(target);
    const startMarginLeft = Number.parseFloat(computed.marginLeft) || 0;
    const startMarginTop = Number.parseFloat(computed.marginTop) || 0;
    const savedDirect = readDirectStore()[key] ?? {};
    const startX = event.clientX;
    const startY = event.clientY;
    let finalWidth = start.width;
    let finalHeight = start.height;
    let finalMarginLeft = savedDirect.marginLeft ?? startMarginLeft;
    let finalMarginTop = savedDirect.marginTop ?? startMarginTop;

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
        marginLeft = startMarginLeft + (start.width - width);
      }
      if (handle.includes('s')) height = Math.max(24, start.height + dy);
      if (handle.includes('n')) {
        height = Math.max(24, start.height - dy);
        marginTop = startMarginTop + (start.height - height);
      }

      finalWidth = width;
      finalHeight = height;
      finalMarginLeft = marginLeft;
      finalMarginTop = marginTop;

      applySize(target, handle.includes('e') || handle.includes('w') ? width : undefined, handle.includes('n') || handle.includes('s') ? height : undefined);
      if (handle.includes('w')) setImportant(target, 'margin-left', `${marginLeft}px`);
      if (handle.includes('n')) setImportant(target, 'margin-top', `${marginTop}px`);
      scheduleMeasure(target);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setResizing(false);
      document.body.removeAttribute('data-studio-resizing');

      persistSize(
        key,
        handle.includes('e') || handle.includes('w') ? finalWidth : undefined,
        handle.includes('n') || handle.includes('s') ? finalHeight : undefined
      );

      if (handle.includes('w') || handle.includes('n')) {
        persistDirect(key, {
          ...savedDirect,
          ...(handle.includes('w') ? { marginLeft: finalMarginLeft } : {}),
          ...(handle.includes('n') ? { marginTop: finalMarginTop } : {})
        });
      }
      scheduleMeasure(target);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const target = targetRef.current;
    if (!target) return;
    const container = visualFlowContainer(target);
    if (!container) return;

    event.preventDefault();
    event.stopPropagation();

    const children = pageBuilderChildren(container);
    if (children.length < 2 || !children.includes(target)) return;
    ensureFlowContainer(container, children);

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

      const current = orderedVisualChildren(container);
      const withoutTarget = current.filter((child) => child !== target);
      const nextIndex = insertionIndex(withoutTarget, pointer.clientX, pointer.clientY);
      if (nextIndex === lastIndex) return;
      lastIndex = nextIndex;

      const nextOrder = [...withoutTarget];
      nextOrder.splice(nextIndex, 0, target);
      persistOrder(nextOrder);
      scheduleMeasure(target);
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (active) {
        setDragging(false);
        document.body.removeAttribute('data-studio-dragging');
        target.removeAttribute('data-studio-moving');
        scheduleMeasure(target);
      }
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  useEffect(() => {
    setMounted(true);
    restoreDirectOverrides();
    restoreFlowContainersFromOrders();

    const syncSelection = () => {
      const selected = document.querySelector('.is-inspector-selected')
        ?? document.querySelector('[data-module-id="hero"]');
      if (selected && selected !== targetRef.current) selectTarget(selected);
      else scheduleMeasure();
    };

    syncSelection();
    const observer = new MutationObserver(syncSelection);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    const onViewportChange = () => scheduleMeasure();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
      resizeObserverRef.current?.disconnect();
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, []);

  if (!mounted || !rect || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`studio-direct-frame ${dragging ? 'is-dragging' : ''} ${resizing ? 'is-resizing' : ''}`}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      data-studio-direct-frame="true"
    >
      <div className="studio-direct-label">
        <button type="button" className="studio-direct-grip" onPointerDown={beginDrag} title="Перетащить элемент в auto-layout">
          <span aria-hidden="true">⠿</span>
          <b>{name}</b>
          <em>{sizeLabel}</em>
        </button>
        <button type="button" className="studio-direct-reset" onClick={resetSelected} title="Сбросить размер и положение">↺</button>
      </div>

      {(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as ResizeHandle[]).map((handle) => (
        <button
          type="button"
          key={handle}
          className={`studio-direct-resize studio-direct-resize-${handle}`}
          data-studio-resize-handle={handle}
          aria-label={`Resize ${handle}`}
          onPointerDown={(event) => beginResize(event, handle)}
        />
      ))}
    </div>,
    document.body
  );
}
