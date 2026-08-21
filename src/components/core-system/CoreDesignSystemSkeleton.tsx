'use client';

import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { BackgroundModule } from '@/design-system/components/BackgroundModule';
import { resolveHistoricalState, toCssVariables } from '@/historical-state/resolveHistoricalState';
import {
  corePassports,
  type CoreInspectableId,
  type CoreModuleId
} from '@/modules/core/modulePassports';

type VisualStateKey = 'core' | 'medieval' | 'imperial' | 'soviet' | 'contemporary';

const visualStates: Array<{ key: VisualStateKey; label: string; layerIds: string[] }> = [
  { key: 'core', label: 'База', layerIds: [] },
  { key: 'medieval', label: 'Древняя Русь', layerIds: ['period:medieval-rus'] },
  { key: 'imperial', label: 'Империя', layerIds: ['polity:empire', 'period:late-18c'] },
  { key: 'soviet', label: 'СССР', layerIds: ['period:stalin'] },
  { key: 'contemporary', label: 'Современность', layerIds: ['period:contemporary'] }
];

const railItems = Array.from({ length: 8 }, (_, index) => ({
  id: `authority-${index}`,
  active: index === 3,
  name: index === 3 ? 'ТЕКУЩИЙ ПРАВИТЕЛЬ' : 'Правитель',
  years: index === 3 ? 'начало—конец правления' : 'год—год'
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
  onInspect: (id: CoreInspectableId) => void;
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
  selectedId: CoreInspectableId | null;
  onClose: () => void;
}) {
  if (!selectedId) return null;
  const passport = corePassports[selectedId];

  const sections: Array<[string, string[]]> = [
    ['Из чего состоит', passport.structure],
    ['Какими средствами собирается', passport.tools],
    ['Какие данные использует', passport.data],
    ['Откуда берутся данные', passport.sources],
    ['Как работает по шагам', passport.flow],
    ['Что делает пользователь', passport.interactions],
    ['Если данных нет или что-то не прошло проверку', passport.fallback],
    ['Как ведёт себя на разных экранах', passport.responsive],
    ['Что может менять историческая эпоха', passport.hvs]
  ];

  return (
    <>
      <button className="inspector-backdrop" aria-label="Закрыть паспорт" onClick={onClose} />
      <aside className="inspector-drawer" aria-label={`Паспорт: ${passport.label}`}>
        <header className="inspector-head">
          <div>
            <small>{passport.kind === 'module' ? 'ПАСПОРТ МОДУЛЯ' : 'ПАСПОРТ ЭЛЕМЕНТА'}</small>
            {passport.parent && <span className="inspector-parent">Внутри: {passport.parent}</span>}
            <h2>{passport.label}</h2>
            <p><b>Что это:</b> {passport.what}</p>
            <p><b>Где находится:</b> {passport.where}</p>
          </div>
          <button onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        <div className="inspector-body">
          {sections.map(([title, values]) => (
            <section key={title}>
              <h3>{title}</h3>
              <ol>{values.map((value) => <li key={value}>{value}</li>)}</ol>
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
  const [selectedId, setSelectedId] = useState<CoreInspectableId | null>(null);
  const [activeTab, setActiveTab] = useState('Обзор');
  const [mapScale, setMapScale] = useState(1);

  const visualState = visualStates.find((state) => state.key === visualStateKey) ?? visualStates[0];
  const resolvedState = useMemo(
    () => resolveHistoricalState({ layerIds: visualState.layerIds }),
    [visualState.layerIds]
  );

  function openPassport(id: CoreInspectableId) {
    if (!inspectorEnabled) return;
    setSelectedId(id);
  }

  function inspectElement(id: CoreInspectableId) {
    return (event: MouseEvent<HTMLElement>) => {
      if (!inspectorEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      openPassport(id);
    };
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
        data-inspector={inspectorEnabled ? 'on' : 'off'}
        data-composition={resolvedState.compositionAccent ?? 'calm'}
        data-image-treatment={resolvedState.imageTreatment ?? 'core'}
        data-map-treatment={resolvedState.mapTreatment ?? 'core'}
      >
        <ModuleRegion id="header" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="core-header">
          <div className="core-brand" data-element-id="header-brand" onClickCapture={inspectElement('header-brand')}>ПРАВИТЕЛИ РОССИИ</div>
          <nav className="core-main-nav" aria-label="Основная навигация">
            {['Хронология', 'Династии', 'Карта эпох', 'События', 'Библиотека', 'О проекте'].map((item, index) => (
              <button data-element-id="header-nav-item" onClickCapture={inspectElement('header-nav-item')} className={index === 0 ? 'active' : ''} key={item}>{item}</button>
            ))}
          </nav>
          <div className="core-utilities">
            <button data-element-id="header-search" onClickCapture={inspectElement('header-search')}>Поиск ⌕</button>
            <button
              data-element-id="header-hvs"
              onClickCapture={inspectElement('header-hvs')}
              onClick={(event) => { event.stopPropagation(); cycleVisualState(); }}
              title="Тест исторического визуального состояния"
            >Эпоха · {visualState.label}</button>
            <button data-element-id="header-menu" onClickCapture={inspectElement('header-menu')}>Меню ☰</button>
          </div>
        </ModuleRegion>

        <div className="core-workspace">
          <ModuleRegion id="historical-rail" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="historical-rail">
            <div className="rail-controls">
              <button data-element-id="rail-control" onClickCapture={inspectElement('rail-control')}>⌃</button>
              <button data-element-id="rail-control" onClickCapture={inspectElement('rail-control')}>⌄</button>
              <button data-element-id="rail-control" onClickCapture={inspectElement('rail-control')}>☷</button>
            </div>
            <div className="rail-list">
              <span className="rail-axis" />
              {railItems.map((item) => (
                <article
                  data-element-id="rail-item"
                  onClickCapture={inspectElement('rail-item')}
                  className={`rail-item ${item.active ? 'active' : ''}`}
                  key={item.id}
                >
                  <div data-element-id="rail-portrait" onClickCapture={inspectElement('rail-portrait')} className="rail-portrait">портрет</div>
                  <div>
                    <strong data-element-id="rail-name" onClickCapture={inspectElement('rail-name')}>{item.name}</strong>
                    <span data-element-id="rail-dates" onClickCapture={inspectElement('rail-dates')}>{item.years}</span>
                    <small>{item.active ? 'chronology.activeAuthorityId' : `chronology.contextWindow[${item.id.split('-')[1]}]`}</small>
                  </div>
                </article>
              ))}
            </div>
          </ModuleRegion>

          <main className="ruler-content">
            <ModuleRegion id="hero" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="core-hero">
              <div className="hero-copy">
                <p className="hero-period" data-element-id="hero-dates" onClickCapture={inspectElement('hero-dates')}>ГОДЫ ЖИЗНИ / ПРАВЛЕНИЯ</p>
                <h1 data-element-id="hero-name" onClickCapture={inspectElement('hero-name')}>ИМЯ<br />ПРАВИТЕЛЯ</h1>
                <p className="hero-summary" data-element-id="hero-summary" onClickCapture={inspectElement('hero-summary')}>Короткая формула правления — 1–2 строки, объясняющие роль и историческое значение текущего правителя.</p>
                <div className="hero-meta">
                  {[
                    ['ДИНАСТИЯ / КОНТЕКСТ','identity.dynastyOrGroup'],
                    ['СТАТУС','identity.primaryTitle'],
                    ['СТОЛИЦА','reign.capitalPlaceId'],
                    ['ПРАВЛЕНИЕ','derived.reignDuration']
                  ].map(([label, value]) => (
                    <div data-element-id="hero-meta-item" onClickCapture={inspectElement('hero-meta-item')} key={label}><small>{label}</small><strong>{value}</strong></div>
                  ))}
                </div>
              </div>

              <div className="hero-art" data-element-id="hero-image" onClickCapture={inspectElement('hero-image')}>
                <span className="hero-art-label">ЦЕЛЬНАЯ HERO-КАРТИНКА<br /><b>hero.imageAssetId</b><em>отдельный файл → проверка на странице → одобрение человеком</em></span>
                <div className="hero-actions">
                  <button data-element-id="hero-action" onClickCapture={inspectElement('hero-action')}>☆</button>
                  <button data-element-id="hero-action" onClickCapture={inspectElement('hero-action')}>↗</button>
                  <button data-element-id="hero-action" onClickCapture={inspectElement('hero-action')}>⛶</button>
                </div>
                <ModuleRegion id="key-events" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="key-events-card">
                  <h3>Ключевые события</h3>
                  {[0,1,2,3].map((index) => (
                    <div data-element-id="key-event-row" onClickCapture={inspectElement('key-event-row')} className="key-event" key={index}>
                      <b>год</b><span>Название ключевого события {index + 1}</span>
                    </div>
                  ))}
                  <button data-element-id="key-events-all" onClickCapture={inspectElement('key-events-all')}>Смотреть все →</button>
                </ModuleRegion>
              </div>
            </ModuleRegion>

            <ModuleRegion id="page-tabs" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="page-tabs">
              {tabs.map((tab) => (
                <button
                  data-element-id="page-tab"
                  onClickCapture={inspectElement('page-tab')}
                  key={tab}
                  className={activeTab === tab ? 'active' : ''}
                  onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setActiveTab(tab); }}
                >{tab}</button>
              ))}
            </ModuleRegion>

            <div className="primary-content-row">
              <ModuleRegion id="territory" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="territory-panel">
                <h2>ТЕРРИТОРИЯ</h2>
                <p data-element-id="territory-summary" onClickCapture={inspectElement('territory-summary')}><b>Короткое объяснение:</b> как менялась территория во время этого правления и что именно нужно увидеть на соседней карте.</p>
                <div className="territory-legend">
                  {['Исходная территория','Присоединённые земли','Граница к концу правления','Зависимые / спорные территории'].map((item, index) => (
                    <div data-element-id="territory-legend-item" onClickCapture={inspectElement('territory-legend-item')} key={item}><i className={`legend-swatch type-${index}`} /><span>{item}</span></div>
                  ))}
                </div>
                <button data-element-id="territory-map-action" onClickCapture={inspectElement('territory-map-action')} className="module-cta">Карта эпохи →</button>
              </ModuleRegion>

              <ModuleRegion id="map" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="historical-map-panel">
                <div data-element-id="map-canvas" onClickCapture={inspectElement('map-canvas')} className="map-canvas" style={{ transform: `scale(${mapScale})` }}>
                  <svg viewBox="0 0 760 360" role="img" aria-label="Схема будущей исторической карты">
                    <path data-element-id="map-boundary-layer" onClickCapture={inspectElement('map-boundary-layer')} d="M120 190 L165 125 L245 98 L300 130 L365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L706 244 L634 271 L574 252 L530 284 L467 252 L414 300 L342 264 L286 293 L232 255 L173 267 L124 225 Z" />
                    <path data-element-id="map-change-layer" onClickCapture={inspectElement('map-change-layer')} className="alt" d="M365 86 L445 112 L510 82 L565 118 L635 104 L684 142 L666 202 L598 199 L540 228 L487 205 L445 217 L405 177 Z" />
                    <circle cx="385" cy="220" r="6" />
                    <text data-element-id="map-place-label" onClickCapture={inspectElement('map-place-label')} x="400" y="225">Столица</text>
                    <text data-element-id="map-place-label" onClickCapture={inspectElement('map-place-label')} x="245" y="155">Город / регион</text>
                    <text data-element-id="map-place-label" onClickCapture={inspectElement('map-place-label')} x="565" y="160">Изменение границы</text>
                  </svg>
                </div>
                <div className="map-controls" data-element-id="map-controls" onClickCapture={inspectElement('map-controls')}>
                  <button onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setMapScale((value) => Math.min(1.12, value + .04)); }}>+</button>
                  <button onClick={(event) => { event.stopPropagation(); if (!inspectorEnabled) setMapScale((value) => Math.max(.92, value - .04)); }}>−</button>
                  <button>↕</button>
                </div>
              </ModuleRegion>

              <ModuleRegion id="facts" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="facts-panel">
                <h2>ФАКТЫ</h2>
                <div className="facts-list">
                  {facts.map(([label, value]) => (
                    <div data-element-id="fact-row" onClickCapture={inspectElement('fact-row')} className="fact-row" key={label}><span>◦</span><label>{label}</label><strong>{value}</strong></div>
                  ))}
                </div>
                <button data-element-id="facts-all" onClickCapture={inspectElement('facts-all')} className="module-cta">Все факты →</button>
              </ModuleRegion>
            </div>

            <ModuleRegion id="thematic-card" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="thematic-row">
              <article className="thematic-card variant-list">
                <h2 data-element-id="thematic-title" onClickCapture={inspectElement('thematic-title')}>РЕФОРМЫ</h2>
                <small data-element-id="thematic-date" onClickCapture={inspectElement('thematic-date')}>период темы</small>
                <ul>{[0,1,2,3,4].map((index) => <li data-element-id="thematic-list-item" onClickCapture={inspectElement('thematic-list-item')} key={index}><b>год</b><span>Название реформы {index + 1}</span></li>)}</ul>
                <button data-element-id="thematic-action" onClickCapture={inspectElement('thematic-action')}>Все реформы →</button>
              </article>

              <article className="thematic-card variant-image">
                <h2 data-element-id="thematic-title" onClickCapture={inspectElement('thematic-title')}>КОНФЛИКТЫ</h2>
                <small data-element-id="thematic-date" onClickCapture={inspectElement('thematic-date')}>период темы</small>
                <p data-element-id="thematic-summary" onClickCapture={inspectElement('thematic-summary')}>2–4 строки о конфликтной оси правления.</p>
                <div data-element-id="thematic-image" onClickCapture={inspectElement('thematic-image')} className="media-zone">Одобренное изображение темы<br />thematicModule.mediaId</div>
                <button data-element-id="thematic-action" onClickCapture={inspectElement('thematic-action')}>Все конфликты →</button>
              </article>

              <article className="thematic-card variant-diagram">
                <h2 data-element-id="thematic-title" onClickCapture={inspectElement('thematic-title')}>ДИНАСТИЯ / ЛЮДИ</h2>
                <small data-element-id="thematic-date" onClickCapture={inspectElement('thematic-date')}>контекст</small>
                <div data-element-id="thematic-diagram" onClickCapture={inspectElement('thematic-diagram')} className="relationship-diagram"><b>текущий правитель</b><span>связи · люди · преемники</span></div>
                <button data-element-id="thematic-action" onClickCapture={inspectElement('thematic-action')}>Все персоны →</button>
              </article>

              <article className="thematic-card variant-mixed">
                <h2 data-element-id="thematic-title" onClickCapture={inspectElement('thematic-title')}>НАСЛЕДИЕ</h2>
                <small data-element-id="thematic-date" onClickCapture={inspectElement('thematic-date')}>период влияния</small>
                <p data-element-id="thematic-summary" onClickCapture={inspectElement('thematic-summary')}>Что правление оставило следующему периоду и какие последствия оказались долговечными.</p>
                <div data-element-id="thematic-image" onClickCapture={inspectElement('thematic-image')} className="media-zone">Изображение наследия</div>
                <button data-element-id="thematic-action" onClickCapture={inspectElement('thematic-action')}>Всё о наследии →</button>
              </article>
            </ModuleRegion>

            <ModuleRegion id="reign-timeline" inspectorEnabled={inspectorEnabled} onInspect={openPassport} className="reign-timeline">
              <article data-element-id="timeline-previous" onClickCapture={inspectElement('timeline-previous')} className="adjacent-ruler"><small>← Предыдущий правитель</small><strong>Имя предыдущего</strong></article>
              <div className="reign-timeline-center">
                <h2 data-element-id="timeline-title" onClickCapture={inspectElement('timeline-title')}>ХРОНОЛОГИЯ ПРАВЛЕНИЯ</h2>
                <div data-element-id="timeline-axis" onClickCapture={inspectElement('timeline-axis')} className="timeline-axis">{[0,20,40,60,80,100].map((left, index) => <i key={left} style={{ left: `${left}%` }} className={index === 0 || index === 5 ? 'edge' : ''} />)}</div>
                <div className="timeline-events">
                  {[0,1,2,3,4,5].map((index) => (
                    <div data-element-id="timeline-event" onClickCapture={inspectElement('timeline-event')} key={index}>
                      <b data-element-id="timeline-event-date" onClickCapture={inspectElement('timeline-event-date')}>{index === 0 ? 'начало' : index === 5 ? 'конец' : 'год'}</b>
                      <span>{index === 0 ? 'Начало правления' : index === 5 ? 'Конец правления' : `Ключевое событие ${index}`}</span>
                    </div>
                  ))}
                </div>
              </div>
              <article data-element-id="timeline-next" onClickCapture={inspectElement('timeline-next')} className="adjacent-ruler next"><small>Следующий правитель →</small><strong>Имя следующего</strong></article>
            </ModuleRegion>
          </main>
        </div>
      </div>

      <button
        className={`inspector-fab ${inspectorEnabled ? 'active' : ''}`}
        onClick={() => { setInspectorEnabled((value) => !value); setSelectedId(null); }}
      >
        {inspectorEnabled ? 'Паспорта: ВКЛ' : 'Проверить элементы'}
      </button>
      <InspectorDrawer selectedId={selectedId} onClose={() => setSelectedId(null)} />
    </BackgroundModule>
  );
}
