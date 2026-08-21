'use client';

import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { BackgroundModule } from '@/design-system/components/BackgroundModule';
import { resolveHistoricalState, toCssVariables } from '@/historical-state/resolveHistoricalState';
import { coreModulePassports, type CoreModuleId } from '@/modules/core/modulePassports';

type VisualStateKey = 'core' | 'medieval' | 'imperial' | 'soviet' | 'contemporary';

const visualStates: Array<{ key: VisualStateKey; label: string; layerIds: string[] }> = [
  { key: 'core', label: 'Core', layerIds: [] },
  { key: 'medieval', label: 'Medieval', layerIds: ['period:medieval-rus'] },
  { key: 'imperial', label: 'Imperial', layerIds: ['polity:empire', 'period:late-18c'] },
  { key: 'soviet', label: 'Soviet', layerIds: ['period:stalin'] },
  { key: 'contemporary', label: 'Contemporary', layerIds: ['period:contemporary'] }
];

const railItems = Array.from({ length: 8 }, (_, index) => ({
  id: `authority-${index}`,
  active: index === 3,
  name: index === 3 ? 'АКТИВНЫЙ ПРАВИТЕЛЬ' : 'Правитель / Authority',
  years: index === 3 ? 'reign.start—reign.end' : 'startYear—endYear'
}));

const tabs = ['Обзор', 'Территория', 'Реформы', 'Конфликты', 'Наследие', 'Документы'];
const facts = [
  ['Дата рождения', 'identity.birthDate'],
  ['Место рождения', 'identity.birthPlaceId'],
  ['Приход к власти', 'accession.date'],
  ['Конец правления', 'reign.endDate'],
  ['Династия / партия', 'identity.groupId'],
  ['Вера / идеология', 'identity.beliefOrIdeology'],
  ['Гос. устройство', 'polity.formOfGovernment']
];

function ModuleRegion({
  id,
  inspectorEnabled,
  onInspect,
  className,
  children
}: {
  id: CoreModuleId;
  inspectorEnabled: boolean;
  onInspect: (id: CoreModuleId) => void;
  className?: string;
  children: ReactNode;
}) {
  function handleClick(event: MouseEvent<HTMLElement>) {
    if (!inspectorEnabled) return;
    event.preventDefault();
    event.stopPropagation();
    onInspect(id);
  }

  return (
    <section
      className={`${className ?? ''} core-module ${inspectorEnabled ? 'is-inspectable' : ''}`.trim()}
      data-module-id={id}
      onClick={handleClick}
    >
      {children}
    </section>
  );
}

function InspectorDrawer({
  selectedId,
  onClose
}: {
  selectedId: CoreModuleId | null;
  onClose: () => void;
}) {
  if (!selectedId) return null;
  const passport = coreModulePassports[selectedId];

  const sections: Array<[string, string[]]> = [
    ['Internal anatomy', passport.anatomy],
    ['Build tools', passport.tools],
    ['Data contract', passport.data],
    ['Sources', passport.sources],
    ['Interactions', passport.interactions],
    ['Responsive', passport.responsive],
    ['HVS permissions', passport.hvs]
  ];

  return (
    <>
      <button className="inspector-backdrop" aria-label="Закрыть паспорт" onClick={onClose} />
      <aside className="inspector-drawer" aria-label={`Паспорт ${passport.label}`}>
        <header className="inspector-head">
          <div>
            <small>CORE MODULE PASSPORT</small>
            <h2>{passport.label}</h2>
            <p>{passport.position}</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="inspector-body">
          {sections.map(([title, values]) => (
            <section key={title}>
              <h3>{title}</h3>
              <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}

export function CoreDesignSystemSkeleton() {
  const [visualStateKey, setVisualStateKey] = useState<VisualStateKey>('core');
  const [inspectorEnabled, setInspectorEnabled] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<CoreModuleId | null>(null);
  const [activeTab, setActiveTab] = useState('Обзор');
  const [mapScale, setMapScale] = useState(1);

  const visualState = visualStates.find((state) => state.key === visualStateKey) ?? visualStates[0];
  const resolvedState = useMemo(
    () => resolveHistoricalState({ layerIds: visualState.layerIds }),
    [visualState.layerIds]
  );

  function openPassport(id: CoreModuleId) {
    if (!inspectorEnabled) return;
    setSelectedModuleId(id);
  }

  function cycleVisualState() {
    const index = visualStates.findIndex((state) => state.key === visualStateKey);
    setVisualStateKey(visualStates[(index + 1) % visualStates.length].key);
  }

  return (
    <BackgroundModule
      style={toCssVariables(resolvedState.tokens)}
      inspectorEnabled={inspectorEnabled}
      onInspect={() => openPassport('background')}
    >
      <div
        className="core-site-surface"
        data-composition={resolvedState.compositionAccent ?? 'calm'}
        data-image-treatment={resolvedState.imageTreatment ?? 'core'}
        data-map-treatment={resolvedState.mapTreatment ?? 'core'}
      >
        <ModuleRegion id="header" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="core-header">
          <div className="core-brand">ПРАВИТЕЛИ РОССИИ</div>
          <nav className="core-main-nav" aria-label="Основная навигация">
            {['Хронология', 'Династии', 'Карта эпох', 'События', 'Библиотека', 'О проекте'].map((item, index) => (
              <button className={index === 0 ? 'active' : ''} key={item}>{item}</button>
            ))}
          </nav>
          <div className="core-utilities">
            <button>Поиск⌕</button>
            <button onClick={(event) => { event.stopPropagation(); cycleVisualState(); }} title="Historical Visual State">HVS · {visualState.label}</button>
            <button>Меню ☰</button>
          </div>
        </ModuleRegion>

        <div className="core-workspace">
          <ModuleRegion id="historical-rail" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="historical-rail">
            <div className="rail-controls"><button>⌃</button><button>⌄</button><button>☷</button></div>
            <div className="rail-list">
              <span className="rail-axis" />
              {railItems.map((item) => (
                <article className={`rail-item ${item.active ? 'active' : ''}`} key={item.id}>
                  <div className="rail-portrait">portrait</div>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.years}</span>
                    <small>{item.active ? 'chronology.activeAuthorityId' : `timeline.entries[${item.id.split('-')[1]}]`}</small>
                  </div>
                </article>
              ))}
            </div>
          </ModuleRegion>

          <main className="ruler-content">
            <ModuleRegion id="hero" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="core-hero">
              <div className="hero-copy">
                <p className="hero-period">identity.lifeDates / reign.period</p>
                <h1>ИМЯ<br />ПРАВИТЕЛЯ</h1>
                <p className="hero-summary">editorial.shortDescription — 1–2 строки, объясняющие роль и историческое значение текущего субъекта власти.</p>
                <div className="hero-meta">
                  <div><small>ДИНАСТИЯ / КОНТЕКСТ</small><strong>identity.dynastyOrGroup</strong></div>
                  <div><small>СТАТУС</small><strong>identity.primaryTitle</strong></div>
                  <div><small>СТОЛИЦА</small><strong>reign.capitalPlaceId</strong></div>
                  <div><small>ПРАВЛЕНИЕ</small><strong>derived.reignDuration</strong></div>
                </div>
              </div>
              <div className="hero-art">
                <span>HERO ART / PORTRAIT<br /><b>media.heroAssetId</b></span>
                <div className="hero-actions"><button>☆</button><button>↗</button><button>⛶</button></div>
                <ModuleRegion id="key-events" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="key-events-card">
                  <h3>Ключевые события</h3>
                  {[0,1,2,3].map((index) => <div className="key-event" key={index}><b>year</b><span>keyEvents[{index}].title</span></div>)}
                  <button>Смотреть все →</button>
                </ModuleRegion>
              </div>
            </ModuleRegion>

            <ModuleRegion id="page-tabs" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="page-tabs">
              {tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setActiveTab(tab); }}>{tab}</button>)}
            </ModuleRegion>

            <div className="primary-content-row">
              <ModuleRegion id="territory" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="territory-panel">
                <h2>ТЕРРИТОРИЯ</h2>
                <p><b>territory.summary</b> — как менялась территория во время текущего правления.</p>
                <div className="territory-legend">
                  {['territory.legend.baseStateLabel','territory.legend.acquiredLabel','territory.legend.endBoundaryLabel','territory.legend.dependentLabel'].map((item, index) => (
                    <div key={item}><i className={`legend-swatch type-${index}`} /><span>{item}</span></div>
                  ))}
                </div>
                <button className="module-cta">Карта эпохи →</button>
              </ModuleRegion>

              <ModuleRegion id="map" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="historical-map-panel">
                <div className="map-canvas" style={{ transform: `scale(${mapScale})` }}>
                  <svg viewBox="0 0 760 360" role="img" aria-label="Схема будущей исторической карты">
                    <path d="M120 190 L165 125 L245 98 L300 130 L365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L706 244 L634 271 L574 252 L530 284 L467 252 L414 300 L342 264 L286 293 L232 255 L173 267 L124 225 Z" />
                    <path className="alt" d="M365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L598 199 L540 228 L487 205 L445 217 L405 177 Z" />
                    <circle cx="385" cy="220" r="6" /><text x="400" y="225">capitalPlaceId</text>
                    <text x="245" y="155">locationIds[]</text><text x="565" y="160">changeSet</text>
                  </svg>
                </div>
                <div className="map-controls">
                  <button onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setMapScale((value) => Math.min(1.12, value + .04)); }}>+</button>
                  <button onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setMapScale((value) => Math.max(.92, value - .04)); }}>−</button>
                  <button>↕</button>
                </div>
              </ModuleRegion>

              <ModuleRegion id="facts" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="facts-panel">
                <h2>ФАКТЫ</h2>
                <div className="facts-list">{facts.map(([label, value]) => <div className="fact-row" key={label}><span>◦</span><label>{label}</label><strong>{value}</strong></div>)}</div>
                <button className="module-cta">Все факты →</button>
              </ModuleRegion>
            </div>

            <ModuleRegion id="thematic-card" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="thematic-row">
              <article className="thematic-card variant-list"><h2>РЕФОРМЫ</h2><small>module.dateRange</small><ul>{[0,1,2,3,4].map((index) => <li key={index}><b>year</b><span>items[{index}].title</span></li>)}</ul><button>Все реформы →</button></article>
              <article className="thematic-card variant-image"><h2>КОНФЛИКТЫ</h2><small>module.dateRange</small><p>module.summary — 2–4 строки о тематической оси правления.</p><div className="media-zone">module.mediaId<br />Media Registry</div><button>Все конфликты →</button></article>
              <article className="thematic-card variant-diagram"><h2>ДИНАСТИЯ / ЛЮДИ</h2><small>module.contextLabel</small><div className="relationship-diagram"><b>activeAuthorityId</b><span>relations[] · persons[] · successors[]</span></div><button>Все персоны →</button></article>
              <article className="thematic-card variant-mixed"><h2>НАСЛЕДИЕ</h2><small>module.dateRange</small><p>legacy.summary — что правление оставило следующему периоду и что оказалось долговечным.</p><div className="media-zone">legacy.mediaId</div><button>Всё о наследии →</button></article>
            </ModuleRegion>

            <ModuleRegion id="reign-timeline" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="reign-timeline">
              <article className="adjacent-ruler"><small>← Предыдущий правитель</small><strong>chronology.previousAuthority.name</strong></article>
              <div className="reign-timeline-center">
                <h2>ХРОНОЛОГИЯ ПРАВЛЕНИЯ</h2>
                <div className="timeline-axis">{[0,20,40,60,80,100].map((left, index) => <i key={left} style={{ left: `${left}%` }} className={index === 0 || index === 5 ? 'edge' : ''} />)}</div>
                <div className="timeline-events">{[0,1,2,3,4,5].map((index) => <div key={index}><b>{index === 0 ? 'start' : index === 5 ? 'end' : 'year'}</b><span>{index === 5 ? 'reign.endEvent.title' : `keyEvents[${Math.max(0,index-1)}].title`}</span></div>)}</div>
              </div>
              <article className="adjacent-ruler next"><small>Следующий правитель →</small><strong>chronology.nextAuthority.name</strong></article>
            </ModuleRegion>
          </main>
        </div>
      </div>

      <button
        className={`inspector-fab ${inspectorEnabled ? 'active' : ''}`}
        onClick={() => { setInspectorEnabled((value) => !value); setSelectedModuleId(null); }}
      >
        {inspectorEnabled ? 'Inspector: ON' : 'Core Inspector'}
      </button>
      <InspectorDrawer selectedId={selectedModuleId} onClose={() => setSelectedModuleId(null)} />
    </BackgroundModule>
  );
}
