'use client';

import { useEffect } from 'react';

const LAYOUT_STORAGE_KEY = 'rulers-of-russia:studio:element-layout:v1';

type ElementLayoutOverride = {
  width?: { value: number; unit: 'auto' | 'px' | '%' };
  height?: { value: number; unit: 'auto' | 'px' | '%' };
  order?: number;
  flexGrow?: number;
  flexShrink?: number;
  alignSelf?: 'auto' | 'stretch' | 'flex-start' | 'center' | 'flex-end';
};

type LayoutStore = Record<string, ElementLayoutOverride>;
type StylableElement = HTMLElement | SVGElement;

function isStylable(value: Element | null): value is StylableElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function occurrence(target: Element, selector: string, root: ParentNode = document) {
  return Array.from(root.querySelectorAll(selector)).indexOf(target);
}

/* Keep the exact same persistence keys as StudioElementControls/V3. */
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

function readStore(): LayoutStore {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? JSON.parse(raw) as LayoutStore : {};
  } catch {
    return {};
  }
}

function writeStore(store: LayoutStore) {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Reordering remains usable for the current session if storage is blocked.
  }
}

function important(target: StylableElement | HTMLElement, property: string, value: string) {
  target.style.setProperty(property, value, 'important');
}

function flowChildren(parent: HTMLElement): StylableElement[] {
  return Array.from(parent.children).filter((child): child is StylableElement => isStylable(child) && Boolean(keyFor(child)));
}

function ensureFlow(parent: HTMLElement, children: StylableElement[]) {
  const computed = getComputedStyle(parent);
  if (['flex', 'inline-flex', 'grid', 'inline-grid'].includes(computed.display)) return;
  if (children.length < 2) return;

  const first = children[0].getBoundingClientRect();
  const second = children[1].getBoundingClientRect();
  const isRow = Math.abs(second.left - first.left) > Math.abs(second.top - first.top);

  important(parent, 'display', 'flex');
  important(parent, 'flex-direction', isRow ? 'row' : 'column');
  important(parent, 'flex-wrap', isRow ? 'wrap' : 'nowrap');
  important(parent, 'align-items', 'stretch');
  parent.setAttribute('data-studio-flow-converted', 'true');
}

function sortedChildren(parent: HTMLElement) {
  return flowChildren(parent).sort((a, b) => {
    const aOrder = Number.parseFloat(getComputedStyle(a).order || '0');
    const bOrder = Number.parseFloat(getComputedStyle(b).order || '0');
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();
    if (Math.abs(aRect.top - bRect.top) > 8) return aRect.top - bRect.top;
    return aRect.left - bRect.left;
  });
}

function insertionIndex(children: StylableElement[], x: number, y: number) {
  for (let index = 0; index < children.length; index += 1) {
    const rect = children[index].getBoundingClientRect();
    const sameRow = y >= rect.top - 12 && y <= rect.bottom + 12;
    if (y < rect.top + rect.height / 2 || (sameRow && x < rect.left + rect.width / 2)) return index;
  }
  return children.length;
}

function persistOrder(children: StylableElement[]) {
  const store = readStore();
  children.forEach((child, index) => {
    const key = keyFor(child);
    if (!key) return;
    store[key] = { ...(store[key] ?? {}), order: index };
    important(child, 'order', String(index));
  });
  writeStore(store);
  window.dispatchEvent(new CustomEvent('studio-layout-change'));
}

/**
 * Makes the selected Studio object itself draggable. V3 already supports the
 * small grip above the frame; this component removes the usability trap where
 * dragging the selected block/card did nothing.
 */
export function StudioSurfaceReorder() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || document.body.hasAttribute('data-studio-resizing')) return;

      const selected = document.querySelector('.is-inspector-selected');
      if (!isStylable(selected) || !(selected instanceof HTMLElement)) return;

      const origin = event.target;
      if (!(origin instanceof Element) || !selected.contains(origin)) return;

      /* If a nested inspectable object is under the pointer, let that object be
         selected first instead of unexpectedly dragging its parent. */
      const nestedInspectable = origin.closest('[data-card-id], [data-module-id], [data-element-id]');
      if (nestedInspectable && nestedInspectable !== selected) return;

      const parent = selected.parentElement;
      if (!parent) return;
      const siblings = flowChildren(parent);
      if (siblings.length < 2 || !siblings.includes(selected)) return;

      ensureFlow(parent, siblings);

      const startX = event.clientX;
      const startY = event.clientY;
      let active = false;
      let lastIndex = -1;

      const onMove = (pointer: PointerEvent) => {
        if (!active && Math.hypot(pointer.clientX - startX, pointer.clientY - startY) < 6) return;

        if (!active) {
          active = true;
          document.body.setAttribute('data-studio-dragging', 'true');
          selected.setAttribute('data-studio-moving', 'true');
        }

        pointer.preventDefault();
        const rest = sortedChildren(parent).filter((child) => child !== selected);
        const index = insertionIndex(rest, pointer.clientX, pointer.clientY);
        if (index === lastIndex) return;
        lastIndex = index;

        const ordered = [...rest];
        ordered.splice(index, 0, selected);
        persistOrder(ordered);
      };

      const finish = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (!active) return;
        document.body.removeAttribute('data-studio-dragging');
        selected.removeAttribute('data-studio-moving');
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  return null;
}
