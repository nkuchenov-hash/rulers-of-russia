'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import '../histographyOrbitPatch.js';
import '../globeWeightAndCityTuning.js';
import '../countryLabelGrounding.js';
import { HistoricalTerritoryGlobeWebGLV21 } from '../HistoricalTerritoryGlobeWebGLV21';
import currentStyles from '../territory-webgl.module.css';
import {
  TERRITORY_MAX_YEAR,
  TERRITORY_MIN_YEAR,
  territoryPeriodAt
} from '../territoryChronology';
import styles from './atlas-lab.module.css';

const YEAR_PX = 6;

const MILESTONES = [
  { year: 862, label: 'Рюрик' },
  { year: 1240, label: 'Невская битва' },
  { year: 1480, label: 'Стояние на Угре' },
  { year: 1547, label: 'Русское царство' },
  { year: 1721, label: 'Империя' },
  { year: 1917, label: 'Революция' },
  { year: 1922, label: 'СССР' },
  { year: 1992, label: 'Россия' },
  { year: 2026, label: 'Сегодня' }
];

function clampYear(value: number) {
  return Math.min(TERRITORY_MAX_YEAR, Math.max(TERRITORY_MIN_YEAR, Math.round(value)));
}

export function AtlasLabClient() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [year, setYear] = useState(TERRITORY_MAX_YEAR);
  const [mode, setMode] = useState<'relief' | 'states'>('relief');
  const period = useMemo(() => territoryPeriodAt(year), [year]);
  const progress = ((year - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100;

  useEffect(() => {
    const root = shellRef.current;
    if (!root) return;

    const query = <T extends HTMLElement>(className: string) =>
      root.querySelector<T>(`[class~="${className}"]`);

    const apply = () => {
      const globeHost = query<HTMLDivElement>(currentStyles.globeHost);
      const topbar = query<HTMLElement>(currentStyles.topbar);
      const story = query<HTMLElement>(currentStyles.story);
      const zoomTools = query<HTMLElement>(currentStyles.zoomTools);
      const timeline = query<HTMLElement>(currentStyles.timeline);
      const labelsHost = globeHost?.querySelector<HTMLElement>('canvas + div');
      const canvas = globeHost?.querySelector<HTMLCanvasElement>('canvas');

      if (globeHost) {
        globeHost.style.inset = '0';
        globeHost.style.contain = 'paint';
      }
      if (canvas) {
        canvas.style.filter = 'saturate(.76) contrast(1.12) brightness(.91)';
      }
      if (labelsHost) {
        labelsHost.style.opacity = '.68';
      }
      if (topbar) topbar.style.display = 'none';
      if (story) story.style.display = 'none';
      if (zoomTools) zoomTools.style.display = 'none';

      // Keep the original timeline alive off-screen. It remains the canonical
      // year controller for V21, while the lab renders a compressed visual rail.
      if (timeline) {
        timeline.style.position = 'fixed';
        timeline.style.left = '-220vw';
        timeline.style.right = 'auto';
        timeline.style.bottom = '0';
        timeline.style.width = '100vw';
        timeline.style.height = '170px';
        timeline.style.opacity = '0';
        timeline.style.pointerEvents = 'none';
      }
    };

    const frame = requestAnimationFrame(apply);
    const retry = window.setTimeout(apply, 180);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(retry);
    };
  }, []);

  function internalButtons(groupClass: string) {
    const root = shellRef.current;
    if (!root) return [] as HTMLButtonElement[];
    const group = root.querySelector<HTMLElement>(`[class~="${groupClass}"]`);
    return group ? Array.from(group.querySelectorAll<HTMLButtonElement>('button')) : [];
  }

  function clickButton(groupClass: string, predicate: (button: HTMLButtonElement, index: number) => boolean) {
    const buttons = internalButtons(groupClass);
    const target = buttons.find(predicate);
    target?.click();
  }

  function setRendererMode(next: 'relief' | 'states') {
    const label = next === 'relief' ? 'Рельеф' : 'Государства';
    clickButton(currentStyles.topActions, (button) => button.textContent?.trim() === label);
    setMode(next);
  }

  function zoom(direction: 'in' | 'out') {
    clickButton(currentStyles.zoomTools, (_button, index) => index === (direction === 'in' ? 0 : 1));
  }

  function focusRussia() {
    clickButton(currentStyles.zoomTools, (_button, index) => index === 2);
  }

  function toggleFullscreen() {
    clickButton(currentStyles.topActions, (button) => {
      const text = button.textContent?.trim();
      return text === 'На весь экран' || text === 'Свернуть';
    });
  }

  function driveYear(raw: number) {
    const next = clampYear(raw);
    const root = shellRef.current;
    const viewport = root?.querySelector<HTMLElement>(`[class~="${currentStyles.rulerViewport}"]`);
    if (viewport) {
      viewport.scrollLeft = (next - TERRITORY_MIN_YEAR) * YEAR_PX;
      viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
    setYear(next);
  }

  const railStyle = { '--progress': `${progress}%` } as CSSProperties;

  return (
    <div ref={shellRef} className={styles.lab}>
      <HistoricalTerritoryGlobeWebGLV21 initialYear={TERRITORY_MAX_YEAR} />

      <div className={styles.cinematicShade} aria-hidden="true" />
      <div className={styles.atmosphereHint} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>Р</span>
          <span className={styles.brandName}>Правители России</span>
        </div>

        <div className={styles.headerControls}>
          <div className={styles.modeSwitch} aria-label="Режим карты">
            <button
              className={mode === 'relief' ? styles.activeMode : ''}
              onClick={() => setRendererMode('relief')}
            >
              Рельеф
            </button>
            <button
              className={mode === 'states' ? styles.activeMode : ''}
              onClick={() => setRendererMode('states')}
            >
              Государства
            </button>
          </div>
          <button className={styles.iconButton} onClick={toggleFullscreen} aria-label="На весь экран">
            ↗
          </button>
        </div>
      </header>

      <aside className={styles.storyOverlay}>
        <span className={styles.eyebrow}>{period.era}</span>
        <h1>{period.label}</h1>
        <div className={styles.periodLine}>
          {period.start} — {period.end === TERRITORY_MAX_YEAR ? 'настоящее время' : period.end}
        </div>
        <p>Историческая территория России на фоне мировых границ и рельефа.</p>
      </aside>

      <nav className={styles.mapTools} aria-label="Управление глобусом">
        <button onClick={focusRussia} aria-label="Вернуться к России">⌖</button>
        <button onClick={() => zoom('in')} aria-label="Приблизить">+</button>
        <button onClick={() => zoom('out')} aria-label="Отдалить">−</button>
      </nav>

      <section className={styles.timelineOverlay} style={railStyle} aria-label="Историческая шкала">
        <div className={styles.timelineTrack} aria-hidden="true" />
        <input
          className={styles.timelineRange}
          type="range"
          min={TERRITORY_MIN_YEAR}
          max={TERRITORY_MAX_YEAR}
          step={1}
          value={year}
          aria-label={`Год: ${year}`}
          onChange={(event) => driveYear(Number(event.target.value))}
        />

        <div className={styles.milestones} aria-hidden="true">
          {MILESTONES.map((milestone) => {
            const left = ((milestone.year - TERRITORY_MIN_YEAR) / (TERRITORY_MAX_YEAR - TERRITORY_MIN_YEAR)) * 100;
            return (
              <span key={milestone.year} className={styles.milestone} style={{ left: `${left}%` }}>
                <i />
                <b>{milestone.year}</b>
                <small>{milestone.label}</small>
              </span>
            );
          })}
        </div>

        <div className={styles.currentPin} aria-hidden="true">
          <i />
          <strong>{year}</strong>
        </div>
      </section>
    </div>
  );
}
