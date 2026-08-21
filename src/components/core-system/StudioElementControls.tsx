'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '@/modules/core/StudioElementControls.module.css';

const LAYOUT_STORAGE_KEY = 'rulers-of-russia:studio:element-layout:v1';

type DimensionUnit = 'auto' | 'px' | '%';

type DimensionValue = {
  value: number;
  unit: DimensionUnit;
};

type ElementLayoutOverride = {
  width?: DimensionValue;
  height?: DimensionValue;
};

type LayoutStore = Record<string, ElementLayoutOverride>;

type Size = {
  width: number;
  height: number;
};

type StylableElement = HTMLElement | SVGElement;

function isStylableElement(value: Element | null): value is StylableElement {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function readStore(): LayoutStore {
  if (typeof window === 'undefined') return {};
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
    // Studio remains usable when local storage is blocked.
  }
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

  const index = occurrenceIndex(target, `[data-element-id="${elementId}"]`);
  return `element:${elementId}:${Math.max(0, index)}`;
}

function targetFromKey(key: string): StylableElement | null {
  const parts = key.split(':');

  if (parts[0] === 'module' && parts[1]) {
    const target = document.querySelector(`[data-module-id="${parts[1]}"]`);
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'card' && parts[1] && parts.length === 2) {
    const target = document.querySelector(`[data-card-id="${parts[1]}"]`);
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'card' && parts[1] && parts[2] === 'element' && parts[3]) {
    const card = document.querySelector(`[data-card-id="${parts[1]}"]`);
    if (!card) return null;
    const index = Number(parts[4] ?? 0);
    const target = card.querySelectorAll(`[data-element-id="${parts[3]}"]`)[index] ?? null;
    return isStylableElement(target) ? target : null;
  }

  if (parts[0] === 'element' && parts[1]) {
    const index = Number(parts[2] ?? 0);
    const target = document.querySelectorAll(`[data-element-id="${parts[1]}"]`)[index] ?? null;
    return isStylableElement(target) ? target : null;
  }

  return null;
}

function rememberOriginalStyle(target: StylableElement) {
  if (!target.hasAttribute('data-studio-original-width')) {
    target.setAttribute('data-studio-original-width', target.style.width || '');
    target.setAttribute('data-studio-original-height', target.style.height || '');
    target.setAttribute('data-studio-original-min-height', target.style.minHeight || '');
    target.setAttribute('data-studio-original-max-height', target.style.maxHeight || '');
    target.setAttribute('data-studio-original-display', target.style.display || '');
  }
}

function restoreStyle(target: StylableElement, property: 'width' | 'height') {
  if (property === 'width') {
    target.style.width = target.getAttribute('data-studio-original-width') ?? '';
  } else {
    target.style.height = target.getAttribute('data-studio-original-height') ?? '';
    target.style.minHeight = target.getAttribute('data-studio-original-min-height') ?? '';
    target.style.maxHeight = target.getAttribute('data-studio-original-max-height') ?? '';
  }
}

function ensureDimensionDisplay(target: StylableElement) {
  if (!(target instanceof HTMLElement)) return;
  if (window.getComputedStyle(target).display === 'inline') {
    target.style.display = 'inline-block';
  }
}

function applyDimension(target: StylableElement, property: 'width' | 'height', setting?: DimensionValue) {
  rememberOriginalStyle(target);

  if (!setting || setting.unit === 'auto') {
    restoreStyle(target, property);
    return;
  }

  ensureDimensionDisplay(target);
  const cssValue = `${Math.max(0, setting.value)}${setting.unit}`;

  if (property === 'width') {
    target.style.width = cssValue;
  } else {
    target.style.height = cssValue;
    // Explicit height in Studio means the requested visual box, even when the base component has a min-height.
    target.style.minHeight = cssValue;
    target.style.maxHeight = 'none';
  }
}

function applyOverride(target: StylableElement, override?: ElementLayoutOverride) {
  applyDimension(target, 'width', override?.width);
  applyDimension(target, 'height', override?.height);
}

function applyAllSavedOverrides() {
  const store = readStore();
  Object.entries(store).forEach(([key, override]) => {
    const target = targetFromKey(key);
    if (target) applyOverride(target, override);
  });
}

function labelForTarget(target: Element | null) {
  if (!target) return 'Элемент';
  return target.getAttribute('data-card-id')
    ?? target.getAttribute('data-module-id')
    ?? target.getAttribute('data-element-id')
    ?? target.tagName.toLowerCase();
}

function defaultDimension(actual: number): DimensionValue {
  return { value: Math.round(actual), unit: 'auto' };
}

function DimensionRow({
  label,
  actual,
  setting,
  onChange
}: {
  label: string;
  actual: number;
  setting: DimensionValue;
  onChange: (next: DimensionValue) => void;
}) {
  return (
    <div className={styles.dimensionRow}>
      <label>{label}</label>
      <div className={styles.dimensionControl}>
        <input
          type="number"
          min={0}
          step={1}
          value={Number.isFinite(setting.value) ? setting.value : Math.round(actual)}
          onFocus={() => {
            if (setting.unit === 'auto') onChange({ value: Math.round(actual), unit: 'px' });
          }}
          onChange={(event) => onChange({
            value: Number(event.target.value),
            unit: setting.unit === 'auto' ? 'px' : setting.unit
          })}
        />
        <select
          value={setting.unit}
          onChange={(event) => onChange({
            value: setting.unit === 'auto' ? Math.round(actual) : setting.value,
            unit: event.target.value as DimensionUnit
          })}
        >
          <option value="auto">auto</option>
          <option value="px">px</option>
          <option value="%">%</option>
        </select>
      </div>
    </div>
  );
}

function convertLegacySlidersToNumbers(panel: Element) {
  panel.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
    input.type = 'number';
    input.inputMode = 'numeric';
  });

  panel.querySelectorAll('label').forEach((label) => {
    const text = label.textContent?.trim();
    if (text === 'Ширина карточки' || text === 'Высота карточки') {
      const row = label.parentElement;
      if (row instanceof HTMLElement) row.style.display = 'none';
    }
  });
}

export function StudioElementControls() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<StylableElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [key, setKey] = useState<string>('module:hero');
  const [name, setName] = useState('hero');
  const [actual, setActual] = useState<Size>({ width: 0, height: 0 });
  const [override, setOverride] = useState<ElementLayoutOverride>({});
  const [message, setMessage] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  function measure(target: StylableElement | null) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    setActual({ width: Math.round(rect.width), height: Math.round(rect.height) });
  }

  function selectTarget(target: Element | null) {
    if (!isStylableElement(target)) return;
    const nextKey = targetKey(target);
    if (!nextKey) return;

    targetRef.current = target;
    setKey(nextKey);
    setName(labelForTarget(target));
    const store = readStore();
    const saved = store[nextKey] ?? {};
    setOverride(saved);
    applyOverride(target, saved);
    measure(target);

    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = new ResizeObserver(() => measure(target));
    resizeObserverRef.current.observe(target);
  }

  function patchDimension(axis: 'width' | 'height', next: DimensionValue) {
    const target = targetRef.current;
    if (!target) return;

    const nextOverride: ElementLayoutOverride = { ...override };
    if (next.unit === 'auto') delete nextOverride[axis];
    else nextOverride[axis] = next;

    const store = readStore();
    if (!nextOverride.width && !nextOverride.height) delete store[key];
    else store[key] = nextOverride;
    writeStore(store);

    setOverride(nextOverride);
    applyOverride(target, nextOverride);
    requestAnimationFrame(() => measure(target));
  }

  function resetSize() {
    patchDimension('width', { value: actual.width, unit: 'auto' });
    requestAnimationFrame(() => patchDimension('height', { value: actual.height, unit: 'auto' }));
  }

  async function sendAiMessage() {
    const endpoint = process.env.NEXT_PUBLIC_STUDIO_AI_ENDPOINT?.trim();
    if (!endpoint || !message.trim()) return;

    setAiBusy(true);
    setAiReply('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          element: {
            key,
            name,
            actualSize: actual,
            layoutOverride: override
          }
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { answer?: string; text?: string };
      setAiReply(body.answer ?? body.text ?? 'AI ответил без текста.');
      setMessage('');
    } catch (error) {
      setAiReply(`Не удалось получить ответ: ${error instanceof Error ? error.message : 'ошибка запроса'}`);
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    let frame = 0;

    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const panel = document.querySelector('.inspector-properties-panel');
        if (panel) {
          convertLegacySlidersToNumbers(panel);
          if (!hostRef.current || !hostRef.current.isConnected) {
            const nextHost = document.createElement('div');
            nextHost.className = 'studio-element-controls-host';
            const firstSection = panel.querySelector('section');
            panel.insertBefore(nextHost, firstSection);
            hostRef.current = nextHost;
            setHost(nextHost);
          }
        } else if (hostRef.current) {
          hostRef.current.remove();
          hostRef.current = null;
          setHost(null);
        }

        applyAllSavedOverrides();
        const selected = document.querySelector('.is-inspector-selected')
          ?? document.querySelector('[data-module-id="hero"]');
        if (selected && selected !== targetRef.current) selectTarget(selected);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resizeObserverRef.current?.disconnect();
      hostRef.current?.remove();
      hostRef.current = null;
    };
  }, []);

  if (!host) return null;

  const widthSetting = override.width ?? defaultDimension(actual.width);
  const heightSetting = override.height ?? defaultDimension(actual.height);
  const aiEndpointReady = Boolean(process.env.NEXT_PUBLIC_STUDIO_AI_ENDPOINT?.trim());

  return createPortal(
    <div className={styles.root}>
      <section className={styles.sizePanel}>
        <div className={styles.sectionHead}>
          <div>
            <span>РАЗМЕР ЭЛЕМЕНТА</span>
            <h3>{name}</h3>
          </div>
          <button type="button" onClick={resetSize}>Сбросить</button>
        </div>
        <div className={styles.actualSize}>Фактически: {actual.width} × {actual.height} px</div>
        <DimensionRow label="Width" actual={actual.width} setting={widthSetting} onChange={(next) => patchDimension('width', next)} />
        <DimensionRow label="Height" actual={actual.height} setting={heightSetting} onChange={(next) => patchDimension('height', next)} />
        <p className={styles.layoutHint}>Размер применяется внутри текущей вёрстки. Строка «Фактически» показывает итог после ограничений родителя и layout.</p>
      </section>

      <section className={styles.aiPanel}>
        <div className={styles.sectionHead}>
          <div>
            <span>AI ДЛЯ ЭЛЕМЕНТА</span>
            <h3>Чат · {name}</h3>
          </div>
        </div>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Например: сделай этот Hero ниже на 80 px и сохрани пропорции внутренних элементов"
          rows={4}
        />
        <button type="button" disabled={!aiEndpointReady || aiBusy || !message.trim()} onClick={sendAiMessage}>
          {aiBusy ? 'Отправляю…' : 'Отправить'}
        </button>
        {!aiEndpointReady && <p className={styles.aiStatus}>Интерфейс готов. Для реального ответа AI нужен защищённый backend endpoint; ключ модели в GitHub Pages храниться не будет.</p>}
        {aiReply && <p className={styles.aiReply}>{aiReply}</p>}
      </section>
    </div>,
    host
  );
}
