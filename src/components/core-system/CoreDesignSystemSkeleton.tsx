'use client';

import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { BackgroundModule } from '@/design-system/components/BackgroundModule';
import { resolveHistoricalState, toCssVariables } from '@/historical-state/resolveHistoricalState';
import type { CoreInspectableId, CoreModuleId } from '@/modules/core/inspectorPassports';
import {
  CoreInspectorDrawer,
  defaultInspectorTuning,
  defaultThematicCardSize,
  type InspectorTuning,
  type ThematicCardSize
} from '@/components/core-system/CoreInspectorDrawer';
import { heroGradientStyle } from '@/modules/hero/heroVisualContract';
import { labRulerPageData } from '@/content/rulers/labRulerPageData';
import type { RulerPageData, ThematicCardData } from '@/content/rulers/pageModel';
import heroStyles from '@/modules/hero/HeroLayers.module.css';
import cardStyles from '@/modules/core/ThematicCardSizing.module.css';

type VisualStateKey = RulerPageData['visualStateKey'];

const visualStates: Array<{ key: VisualStateKey; label: string; layerIds: string[] }> = [
  { key: 'core', label: 'База', layerIds: [] },
  { key: 'medieval', label: 'Древняя Русь', layerIds: ['period:medieval-rus'] },
  { key: 'imperial', label: 'Империя', layerIds: ['polity:empire', 'period:late-18c'] },
  { key: 'soviet', label: 'СССР', layerIds: ['period:stalin'] },
  { key: 'contemporary', label: 'Современность', layerIds: ['period:contemporary'] }
];

function ModuleRegion({
  id,
  inspectorEnabled,
  onInspect,
  className,
  style,
  children
}: {
  id: CoreModuleId;
  inspectorEnabled: boolean;
  onInspect: (id: CoreInspectableId, target?: Element | null) => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!inspectorEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    onInspect(id, event.currentTarget);
  }

  return (
    <section
      className={`${className ?? ''} core-module ${inspectorEnabled ? 'is-inspectable' : ''}`.trim()}
      data-module-id={id}
      onClick={handleClick}
      style={style}
    >
      {children}
    </section>
  );
}

function ThematicCard({
  card,
  size,
  inspectorEnabled,
  selected,
  onInspectCard,
  elementHandler
}: {
  card: ThematicCardData;
  size: ThematicCardSize;
  inspectorEnabled: boolean;
  selected: boolean;
  onInspectCard: (cardId: string, target: Element) => void;
  elementHandler: (id: CoreInspectableId, normalAction?: () => void) => (event: MouseEvent<Element>) => void;
}) {
  const variantClass = card.type === 'list'
    ? 'variant-list'
    : card.type === 'image'
      ? 'variant-image'
      : card.type === 'diagram'
        ? 'variant-diagram'
        : 'variant-mixed';

  return (
    <article
      className={`thematic-card ${variantClass} ${cardStyles.card}`}
      data-card-id={card.id}
      data-inspector-card-selected={selected ? 'true' : 'false'}
      style={{ width: `${size.width}px`, height: `${size.height}px` }}
      onClick={(event) => {
        if (!inspectorEnabled) return;
        event.preventDefault();
        event.stopPropagation();
        onInspectCard(card.id, event.currentTarget);
      }}
    >
      <h2 data-element-id="thematic-title" onClick={elementHandler('thematic-title')}>{card.title}</h2>
      {card.dateLabel && <small data-element-id="thematic-date" onClick={elementHandler('thematic-date')}>{card.dateLabel}</small>}

      {card.type === 'list' && card.items && (
        <ul>
          {card.items.map((item, index) => (
            <li data-element-id="thematic-list-item" onClick={elementHandler('thematic-list-item')} key={`${card.id}-${index}`}>
              <b>{item.year}</b><span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}

      {card.summary && <p data-element-id="thematic-summary" onClick={elementHandler('thematic-summary')}>{card.summary}</p>}

      {card.type === 'diagram' && card.diagram && (
        <div data-element-id="thematic-diagram" onClick={elementHandler('thematic-diagram')} className="relationship-diagram">
          <b>{card.diagram.centerLabel}</b>
          <span>{card.diagram.nodes.join(' · ')}</span>
        </div>
      )}

      {card.mediaLabel && (
        <div data-element-id="thematic-image" onClick={elementHandler('thematic-image')} className="media-zone">{card.mediaLabel}</div>
      )}

      <button data-element-id="thematic-action" onClick={elementHandler('thematic-action')}>{card.actionLabel}</button>
    </article>
  );
}

export function CoreDesignSystemSkeleton({
  data = labRulerPageData,
  editorMode = false
}: {
  data?: RulerPageData;
  editorMode?: boolean;
}) {
  const initialTab = data.tabs.find((tab) => tab.enabled)?.label ?? 'Обзор';
  const [visualStateKey, setVisualStateKey] = useState<VisualStateKey>(data.visualStateKey);
  const [inspectorEnabled, setInspectorEnabled] = useState(editorMode);
  const [selectedId, setSelectedId] = useState<CoreInspectableId | null>(editorMode ? 'hero' : null);
  const [selectedThematicCardId, setSelectedThematicCardId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [mapScale, setMapScale] = useState(1);
  const [inspectorTuning, setInspectorTuning] = useState<InspectorTuning>(defaultInspectorTuning);

  const visualState = visualStates.find((state) => state.key === visualStateKey) ?? visualStates[0];
  const resolvedState = useMemo(
    () => resolveHistoricalState({ layerIds: visualState.layerIds }),
    [visualState.layerIds]
  );

  const heroVariables = {
    '--hero-image-x': `${inspectorTuning.heroImageX}%`,
    '--hero-image-y': `${inspectorTuning.heroImageY}%`,
    '--hero-dates-size': `${inspectorTuning.heroDatesSize}px`,
    '--hero-name-size': `${inspectorTuning.heroNameSize}px`,
    '--hero-summary-size': `${inspectorTuning.heroSummarySize}px`,
    '--hero-summary-width': `${inspectorTuning.heroSummaryWidth}px`,
    '--hero-meta-size': `${inspectorTuning.heroMetaSize}px`,
    '--hero-events-width': `${inspectorTuning.keyEventsWidth}px`,
    '--hero-event-font-size': `${inspectorTuning.keyEventFontSize}px`,
    '--hero-action-size': `${inspectorTuning.heroActionSize}px`
  } as CSSProperties;

  function clearInspectorHighlight() {
    document.querySelectorAll('.is-inspector-selected').forEach((node) => node.classList.remove('is-inspector-selected'));
  }

  function openPassport(id: CoreInspectableId, target?: Element | null) {
    if (!inspectorEnabled) return;
    clearInspectorHighlight();
    target?.classList.add('is-inspector-selected');
    if (id !== 'thematic-card') setSelectedThematicCardId(null);
    setSelectedId(id);
  }

  function inspectThematicCard(cardId: string, target: Element) {
    if (!inspectorEnabled) return;
    setSelectedThematicCardId(cardId);
    openPassport('thematic-card', target);
  }

  function selectLayerFromTree(id: CoreInspectableId, targetSelector?: string) {
    if (!inspectorEnabled) return;
    const target = targetSelector ? document.querySelector(targetSelector) : null;

    if (id === 'thematic-card') {
      const cardTarget = target?.matches('[data-card-id]')
        ? target
        : target?.querySelector('[data-card-id]') ?? document.querySelector('[data-card-id]');
      const cardId = cardTarget?.getAttribute('data-card-id') ?? null;
      if (cardId && cardTarget) {
        setSelectedThematicCardId(cardId);
        openPassport(id, cardTarget);
        cardTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return;
      }
    }

    openPassport(id, target);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  function elementHandler(id: CoreInspectableId, normalAction?: () => void) {
    return (event: MouseEvent<Element>) => {
      event.stopPropagation();
      if (inspectorEnabled) {
        event.preventDefault();
        openPassport(id, event.currentTarget);
        return;
      }
      normalAction?.();
    };
  }

  function cycleVisualState() {
    const index = visualStates.findIndex((state) => state.key === visualStateKey);
    setVisualStateKey(visualStates[(index + 1) % visualStates.length].key);
  }

  function closeInspectorDrawer() {
    clearInspectorHighlight();
    setSelectedThematicCardId(null);
    setSelectedId(null);
  }

  function toggleInspector() {
    clearInspectorHighlight();
    setInspectorEnabled((value) => {
      const next = !value;
      setSelectedThematicCardId(null);
      setSelectedId(next ? 'hero' : null);
      return next;
    });
  }

  function thematicCardSize(cardId: string): ThematicCardSize {
    return inspectorTuning.thematicCardSizes[cardId] ?? defaultThematicCardSize;
  }

  return (
    <BackgroundModule
      style={toCssVariables(resolvedState.tokens)}
      inspectorEnabled={editorMode && inspectorEnabled}
      onInspect={() => selectLayerFromTree('background', '[data-module-id="background"]')}
    >
      <div
        className="core-site-surface"
        data-inspector={editorMode && inspectorEnabled ? 'on' : 'off'}
        data-composition={resolvedState.compositionAccent ?? 'calm'}
        data-image-treatment={resolvedState.imageTreatment ?? 'core'}
        data-map-treatment={resolvedState.mapTreatment ?? 'core'}
      >
        <ModuleRegion id="header" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="core-header">
          <div className="core-brand" data-element-id="header-brand" onClick={elementHandler('header-brand')}>ПРАВИТЕЛИ РОССИИ</div>
          <nav className="core-main-nav" aria-label="Основная навигация">
            {['Хронология', 'Династии', 'Карта эпох', 'События', 'Библиотека', 'О проекте'].map((item, index) => (
              <button data-element-id="header-nav-item" onClick={elementHandler('header-nav-item')} className={index === 0 ? 'active' : ''} key={item}>{item}</button>
            ))}
          </nav>
          <div className="core-utilities">
            <button data-element-id="header-search" onClick={elementHandler('header-search')}>Поиск ⌕</button>
            <button data-element-id="header-hvs" onClick={elementHandler('header-hvs', cycleVisualState)} title="Историческое визуальное состояние">Эпоха · {visualState.label}</button>
            <button data-element-id="header-menu" onClick={elementHandler('header-menu')}>Меню ☰</button>
          </div>
        </ModuleRegion>

        <div className="core-workspace">
          <ModuleRegion id="historical-rail" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="historical-rail">
            <div className="rail-controls">
              <button data-element-id="rail-control" onClick={elementHandler('rail-control')}>⌃</button>
              <button data-element-id="rail-control" onClick={elementHandler('rail-control')}>⌄</button>
              <button data-element-id="rail-control" onClick={elementHandler('rail-control')}>☷</button>
            </div>
            <div className="rail-list">
              <span className="rail-axis" />
              {data.rail.map((item) => (
                <article
                  data-element-id={item.active ? 'rail-active-item' : 'rail-item'}
                  onClick={elementHandler(item.active ? 'rail-active-item' : 'rail-item')}
                  className={`rail-item ${item.active ? 'active' : ''}`}
                  style={item.active ? {
                    width: `${inspectorTuning.railActiveWidth}px`,
                    height: `${inspectorTuning.railActiveHeight}px`,
                    minHeight: `${inspectorTuning.railActiveHeight}px`,
                    maxWidth: '100%'
                  } : undefined}
                  key={item.id}
                >
                  <div data-element-id="rail-portrait" onClick={elementHandler('rail-portrait')} className="rail-portrait">{item.portraitLabel ?? item.name.slice(0, 2)}</div>
                  <div>
                    <strong data-element-id="rail-name" onClick={elementHandler('rail-name')}>{item.name}</strong>
                    <span data-element-id="rail-dates" onClick={elementHandler('rail-dates')}>{item.years}</span>
                    {editorMode && <small>{item.active ? 'activeAuthorityId' : item.id}</small>}
                  </div>
                </article>
              ))}
            </div>
          </ModuleRegion>

          <main className="ruler-content">
            <ModuleRegion
              id="hero"
              inspectorEnabled={editorMode && inspectorEnabled}
              onInspect={openPassport}
              className={`core-hero ${heroStyles.heroCanvas}`}
              style={heroVariables}
            >
              <div className={`hero-art ${heroStyles.heroImage}`} data-element-id="hero-image" onClick={elementHandler('hero-image')}>
                <span className={`hero-art-label ${heroStyles.imageLabel}`}>
                  <b>{data.hero.imageFallbackLabel ?? data.hero.displayName}</b>
                  {editorMode && <em>{data.hero.imageAssetId ? `Media asset: ${data.hero.imageAssetId}` : 'Media asset ещё не утверждён; public renderer использует чистый визуальный fallback.'}</em>}
                </span>
                <div className="hero-actions">
                  <button data-element-id="hero-action" onClick={elementHandler('hero-action')}>☆</button>
                  <button data-element-id="hero-action" onClick={elementHandler('hero-action')}>↗</button>
                  <button data-element-id="hero-action" onClick={elementHandler('hero-action')}>⛶</button>
                </div>
                <ModuleRegion id="key-events" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="key-events-card">
                  <h3>Ключевые события</h3>
                  {data.hero.keyEvents.map((event) => (
                    <div data-element-id="key-event-row" onClick={elementHandler('key-event-row')} className="key-event" key={event.id}>
                      <b>{event.year}</b><span>{event.title}</span>
                    </div>
                  ))}
                  <button data-element-id="key-events-all" onClick={elementHandler('key-events-all')}>Смотреть все →</button>
                </ModuleRegion>
              </div>

              <div
                className={heroStyles.gradientPanel}
                data-element-id="hero-gradient"
                onClick={elementHandler('hero-gradient')}
                style={heroGradientStyle(inspectorTuning.gradient)}
                aria-label="Полупрозрачный градиент Hero"
              >
                {editorMode && <p className={heroStyles.gradientHint}>Градиент Hero · настраиваемый слой</p>}
              </div>

              <div className={`hero-copy ${heroStyles.heroContent}`}>
                <p className="hero-period" data-element-id="hero-dates" onClick={elementHandler('hero-dates')}>{data.hero.datesLabel}</p>
                <h1 data-element-id="hero-name" onClick={elementHandler('hero-name')}>{data.hero.displayName}</h1>
                <p className="hero-summary" data-element-id="hero-summary" onClick={elementHandler('hero-summary')}>{data.hero.summary}</p>
                <div className="hero-meta">
                  {data.hero.meta.map((item) => (
                    <div data-element-id="hero-meta-item" onClick={elementHandler('hero-meta-item')} key={item.id}>
                      <small>{item.label}</small><strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </ModuleRegion>

            <ModuleRegion id="page-tabs" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="page-tabs">
              {data.tabs.filter((tab) => tab.enabled).map((tab) => (
                <button data-element-id="page-tab" key={tab.id} className={activeTab === tab.label ? 'active' : ''} onClick={elementHandler('page-tab', () => setActiveTab(tab.label))}>{tab.label}</button>
              ))}
            </ModuleRegion>

            <div className="primary-content-row">
              <ModuleRegion id="territory" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="territory-panel">
                <h2>ТЕРРИТОРИЯ</h2>
                <p data-element-id="territory-summary" onClick={elementHandler('territory-summary')}>{data.territory.summary}</p>
                <div className="territory-legend">
                  {data.territory.legend.map((item, index) => (
                    <div data-element-id="territory-legend-item" onClick={elementHandler('territory-legend-item')} key={item.id}>
                      <i className={`legend-swatch type-${index}`} /><span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <button data-element-id="territory-map-action" onClick={elementHandler('territory-map-action')} className="module-cta">Карта эпохи →</button>
              </ModuleRegion>

              <ModuleRegion id="map" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="historical-map-panel">
                <div data-element-id="map-canvas" onClick={elementHandler('map-canvas')} className="map-canvas" style={{ transform: `scale(${mapScale})` }}>
                  <svg viewBox="0 0 760 360" role="img" aria-label={data.map.ariaLabel}>
                    <path data-element-id="map-boundary-layer" onClick={elementHandler('map-boundary-layer')} d="M120 190 L165 125 L245 98 L300 130 L365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L706 244 L634 271 L574 252 L530 284 L467 252 L414 300 L342 264 L286 293 L232 255 L173 267 L124 225 Z" />
                    <path data-element-id="map-change-layer" onClick={elementHandler('map-change-layer')} className="alt" d="M365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L598 199 L540 228 L487 205 L445 217 L405 177 Z" />
                    <text data-element-id="map-place-label" onClick={elementHandler('map-place-label')} x="135" y="330">{data.map.primaryLabel}</text>
                    <text data-element-id="map-place-label" onClick={elementHandler('map-place-label')} x="430" y="48">{data.map.changeLabel}</text>
                    {data.map.places.map((place) => (
                      <g key={place.id}>
                        {(place.kind === 'capital' || place.kind === 'city') && <circle cx={place.x} cy={place.y} r={place.kind === 'capital' ? 7 : 5} />}
                        <text data-element-id="map-place-label" onClick={elementHandler('map-place-label')} x={place.x + 11} y={place.y + 5}>{place.label}</text>
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="map-controls" data-element-id="map-controls" onClick={elementHandler('map-controls')}>
                  <button onClick={elementHandler('map-controls', () => setMapScale((value) => Math.min(1.12, value + .04)))}>+</button>
                  <button onClick={elementHandler('map-controls', () => setMapScale((value) => Math.max(.92, value - .04)))}>−</button>
                  <button onClick={elementHandler('map-controls')}>↕</button>
                </div>
              </ModuleRegion>

              <ModuleRegion id="facts" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="facts-panel">
                <h2>ФАКТЫ</h2>
                <div className="facts-list">
                  {data.facts.map((fact) => (
                    <div data-element-id="fact-row" onClick={elementHandler('fact-row')} className="fact-row" key={fact.id}>
                      <span>◦</span><label>{fact.label}</label><strong>{fact.value}</strong>
                    </div>
                  ))}
                </div>
                <button data-element-id="facts-all" onClick={elementHandler('facts-all')} className="module-cta">Все факты →</button>
              </ModuleRegion>
            </div>

            <ModuleRegion
              id="thematic-card"
              inspectorEnabled={editorMode && inspectorEnabled}
              onInspect={openPassport}
              className={`thematic-row ${cardStyles.row}`}
            >
              {data.thematic.map((card) => (
                <ThematicCard
                  key={card.id}
                  card={card}
                  size={thematicCardSize(card.id)}
                  inspectorEnabled={editorMode && inspectorEnabled}
                  selected={selectedThematicCardId === card.id}
                  onInspectCard={inspectThematicCard}
                  elementHandler={elementHandler}
                />
              ))}
            </ModuleRegion>

            <ModuleRegion id="reign-timeline" inspectorEnabled={editorMode && inspectorEnabled} onInspect={openPassport} className="reign-timeline">
              <article data-element-id="timeline-previous" onClick={elementHandler('timeline-previous')} className="adjacent-ruler">
                <small>← Предыдущий правитель</small><strong>{data.timeline.previous?.name ?? '—'}</strong>
              </article>
              <div className="reign-timeline-center">
                <h2 data-element-id="timeline-title" onClick={elementHandler('timeline-title')}>{data.timeline.title}</h2>
                <div data-element-id="timeline-axis" onClick={elementHandler('timeline-axis')} className="timeline-axis">
                  {data.timeline.events.map((event, index) => (
                    <i key={event.id} style={{ left: `${(index / Math.max(1, data.timeline.events.length - 1)) * 100}%` }} className={index === 0 || index === data.timeline.events.length - 1 ? 'edge' : ''} />
                  ))}
                </div>
                <div className="timeline-events" style={{ gridTemplateColumns: `repeat(${data.timeline.events.length},1fr)` }}>
                  {data.timeline.events.map((event) => (
                    <div data-element-id="timeline-event" onClick={elementHandler('timeline-event')} key={event.id}>
                      <b data-element-id="timeline-event-date" onClick={elementHandler('timeline-event-date')}>{event.date}</b>
                      <span>{event.title}</span>
                    </div>
                  ))}
                </div>
              </div>
              <article data-element-id="timeline-next" onClick={elementHandler('timeline-next')} className="adjacent-ruler next">
                <small>Следующий правитель →</small><strong>{data.timeline.next?.name ?? '—'}</strong>
              </article>
            </ModuleRegion>
          </main>
        </div>
      </div>

      {editorMode && (
        <>
          <button className={`inspector-fab ${inspectorEnabled ? 'active' : ''}`} onClick={toggleInspector}>
            {inspectorEnabled ? 'Паспорта: ВКЛ' : 'Проверить элементы'}
          </button>

          <CoreInspectorDrawer
            selectedId={selectedId}
            selectedThematicCardId={selectedThematicCardId}
            onClose={closeInspectorDrawer}
            onSelectLayer={selectLayerFromTree}
            tuning={inspectorTuning}
            onTuningChange={setInspectorTuning}
          />
        </>
      )}
    </BackgroundModule>
  );
}
