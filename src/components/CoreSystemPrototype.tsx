'use client';

import { useState } from 'react';

type VisualState = 'core' | 'imperial' | 'rupture' | 'monumental' | 'contemporary';
type MapLayer = 'borders' | 'changes' | 'cities' | 'conflicts';

type ContractProps = {
  label: string;
  path: string;
  source: string;
  rule: string;
  show: boolean;
};

const visualStates: Array<{ id: VisualState; label: string; note: string }> = [
  { id: 'core', label: 'Core', note: 'Нейтральная продуктовая система без исторического override.' },
  { id: 'imperial', label: 'Imperial structure', note: 'Материалы, контраст и framing меняются, структура страницы остаётся.' },
  { id: 'rupture', label: 'Historical rupture', note: 'Состояние для политического разрыва: более резкий ритм и фрагментация.' },
  { id: 'monumental', label: 'Monumental state', note: 'Осевой, тяжёлый визуальный характер для централизованного государства XX века.' },
  { id: 'contemporary', label: 'Contemporary', note: 'Чистый документальный визуальный слой Нового времени.' }
];

function Contract({ label, path, source, rule, show }: ContractProps) {
  if (!show) return null;
  return (
    <details className="contract-line">
      <summary>
        <span>{label}</span>
        <code>{path}</code>
      </summary>
      <div>
        <p><strong>Источник:</strong> {source}</p>
        <p><strong>Как загружается:</strong> {rule}</p>
      </div>
    </details>
  );
}

function ModuleHeading({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <header className="module-heading">
      <p className="eyebrow">{index}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

export function CoreSystemPrototype() {
  const [visualState, setVisualState] = useState<VisualState>('core');
  const [showProvenance, setShowProvenance] = useState(true);
  const [chronologyPosition, setChronologyPosition] = useState(48);
  const [activePhase, setActivePhase] = useState(2);
  const [mapYear, setMapYear] = useState(50);
  const [mapLayers, setMapLayers] = useState<Record<MapLayer, boolean>>({
    borders: true,
    changes: true,
    cities: true,
    conflicts: false
  });
  const [foreignMode, setForeignMode] = useState<'war' | 'diplomacy'>('war');
  const [documentMode, setDocumentMode] = useState<'original' | 'transcription' | 'context'>('original');

  const state = visualStates.find((item) => item.id === visualState) ?? visualStates[0];

  return (
    <main className="core-prototype" data-visual-state={visualState}>
      <header className="site-shell-header">
        <a className="brand-lockup" href="#top" aria-label="Правители России — начало страницы">
          <span className="brand-mark">РР</span>
          <span><strong>Правители России</strong><small>Core System</small></span>
        </a>
        <nav className="header-nav" aria-label="Навигация прототипа">
          <a href="#page">Страница</a>
          <a href="#core-system">Core UI</a>
          <a href="#pipeline">Данные</a>
        </nav>
        <button className={`provenance-toggle ${showProvenance ? 'is-active' : ''}`} onClick={() => setShowProvenance((value) => !value)}>
          {showProvenance ? 'Data contract: ON' : 'Data contract: OFF'}
        </button>
      </header>

      <section className="visual-state-bar" id="top">
        <div>
          <span>Historical Visual State</span>
          <strong>{state.label}</strong>
          <small>{state.note}</small>
        </div>
        <div className="state-switcher" role="group" aria-label="Historical Visual State">
          {visualStates.map((item) => (
            <button key={item.id} className={visualState === item.id ? 'is-active' : ''} onClick={() => setVisualState(item.id)}>{item.label}</button>
          ))}
        </div>
      </section>

      <section className="global-chronology" aria-label="Global Chronology Shell">
        <div className="chronology-copy">
          <p className="eyebrow">GLOBAL CHRONOLOGY SHELL</p>
          <strong>chronology.activeNode</strong>
          <span>Постоянная навигация по власти, а не модуль конкретной страницы.</span>
        </div>
        <div className="chronology-control">
          <div className="chronology-labels"><span>chronology.previousNode</span><b>chronology.activeNode</b><span>chronology.nextNode</span></div>
          <input type="range" min="0" max="100" value={chronologyPosition} onChange={(event) => setChronologyPosition(Number(event.target.value))} aria-label="Позиция в глобальной хронологии" />
          <small>Position {chronologyPosition}% · Chronology Graph → active node → Page Resolver → Historical Visual State Resolver</small>
        </div>
      </section>

      <div className="ruler-page-shell" id="page">
        <section className="ruler-hero module-section" id="hero">
          <div className="hero-media">
            <span className="media-kind">VERIFIED HERO MEDIA</span>
            <strong>ruler.media.heroAssetId</strong>
            <small>Media Library → asset record → rights/provenance → responsive image transform</small>
          </div>
          <div className="hero-copy">
            <span className="role-chip">ruler.identity.primaryTitle</span>
            <h1>ruler.identity.canonicalName</h1>
            <p className="reign-dates">ruler.reign.startDate — ruler.reign.endDate</p>
            <p className="hero-significance">ruler.editorial.oneLineSignificance</p>
            <div className="hero-meta">
              <span>ruler.polity.name</span>
              <span>ruler.identity.dynastyOrPoliticalContext</span>
              <span>derived.reignDuration</span>
            </div>
            <div className="contract-stack">
              <Contract show={showProvenance} label="Главный образ" path="ruler.media.heroAssetId" source="Media Library" rule="Page Resolver получает mediaId из ruler record и резолвит его в MediaAsset с правами и provenance." />
              <Contract show={showProvenance} label="Имя / субъект власти" path="ruler.identity.canonicalName" source="Ruler / Authority Registry" rule="Каноническое имя человека либо официальное название коллективного органа власти." />
              <Contract show={showProvenance} label="Формула правления" path="ruler.editorial.oneLineSignificance" source="Editorial Layer" rule="Редакторский synthesis с sourceIds[]; никогда не генерируется компонентом на лету." />
            </div>
          </div>
        </section>

        <section className="module-section snapshot-module" id="snapshot">
          <ModuleHeading index="01 · ORIENTATION" title="Reign Snapshot" description="Первый информационный слой после Hero: пользователь должен понять конфигурацию власти за несколько секунд." />
          <div className="snapshot-grid">
            <article><span>Длительность</span><strong>derived.reignDuration</strong><small>из reign.startDate / endDate</small></article>
            <article><span>Приход к власти</span><strong>ruler.accession.method</strong><small>structured enum + editorial context</small></article>
            <article><span>Предшествующая власть</span><strong>predecessorIds[]</strong><small>Chronology Graph</small></article>
            <article><span>Следующая власть</span><strong>successorIds[]</strong><small>одна или несколько ветвей</small></article>
          </div>
          <div className="highlight-list">
            <div><b>01</b><span>ruler.snapshot.highlights[0].title</span><small>highlight.sourceIds[]</small></div>
            <div><b>02</b><span>ruler.snapshot.highlights[1].title</span><small>highlight.sourceIds[]</small></div>
            <div><b>03</b><span>ruler.snapshot.highlights[2].title</span><small>highlight.sourceIds[]</small></div>
          </div>
          <Contract show={showProvenance} label="Ключевые характеристики" path="ruler.snapshot.highlights[]" source="Editorial Layer + Source Registry" rule="3–5 тезисов; каждый claim обязан иметь sourceIds[] и evidenceStatus." />
        </section>

        <section className="module-section starting-point-module" id="starting-point">
          <ModuleHeading index="02 · CONTEXT" title="Starting Point" description="Что именно существовало в момент начала власти: способ перехода, состояние страны, карта и унаследованные проблемы." />
          <div className="starting-grid">
            <article className="starting-lead"><span>Как власть началась</span><h3>ruler.accession.context</h3><p>ruler.accession.summary</p><small>Accession Record → editorial summary → sourceIds[]</small></article>
            <article><span>Государственное устройство</span><strong>startingPoint.conditions[government]</strong></article>
            <article><span>Войны / внешние риски</span><strong>startingPoint.conditions[external]</strong></article>
            <article><span>Общество / экономика</span><strong>startingPoint.conditions[society]</strong></article>
            <article className="starting-map"><span>Стартовая карта</span><strong>ruler.map.startStateId</strong><small>Historical Map Dataset</small></article>
          </div>
          <Contract show={showProvenance} label="Унаследованные процессы" path="ruler.startingPoint.inheritedIssues[]" source="Editorial chronology links + Event Registry" rule="Каждый issue связан с ранее начавшимся event/process и не дублирует его текст вручную." />
        </section>

        <section className="module-section reign-arc-module" id="reign-arc">
          <ModuleHeading index="03 · NARRATIVE" title="Reign Arc" description="Крупные фазы правления. Не вся хронология, а редакционно выбранные переломы, которые объясняют развитие периода." />
          <div className="phase-tabs" role="tablist" aria-label="Фазы правления">
            {[0, 1, 2, 3, 4].map((phase) => (
              <button key={phase} className={activePhase === phase ? 'is-active' : ''} onClick={() => setActivePhase(phase)}>
                <span>phase[{phase}].dateRange</span><strong>phase[{phase}].title</strong>
              </button>
            ))}
          </div>
          <div className="phase-stage">
            <div><span>ACTIVE PHASE</span><h3>reignArc.phases[{activePhase}].title</h3><p>reignArc.phases[{activePhase}].summary</p></div>
            <div className="phase-events">
              <article><span>Event Registry</span><strong>eventIds[0] → event.title</strong><small>event.significance</small></article>
              <article><span>Event Registry</span><strong>eventIds[1] → event.title</strong><small>event.significance</small></article>
              <article><span>Media Library</span><strong>mediaIds[0] → MediaAsset</strong><small>image provenance + caption</small></article>
            </div>
          </div>
          <Contract show={showProvenance} label="Фазы правления" path="ruler.reignArc.phases[]" source="Editorial Layer" rule="Каждая фаза хранит dateRange, summary, significance, eventIds[], mediaIds[] и sourceIds[]. События переиспользуются картой и другими модулями." />
        </section>

        <section className="module-section map-module" id="map">
          <ModuleHeading index="04 · GEOGRAPHY" title="Territory & Map" description="Состояние территории во времени: границы, изменения, города, войны и географические последствия событий." />
          <div className="map-toolbar">
            <div className="map-layer-buttons">
              {(Object.keys(mapLayers) as MapLayer[]).map((layer) => (
                <button key={layer} className={mapLayers[layer] ? 'is-active' : ''} onClick={() => setMapLayers((current) => ({ ...current, [layer]: !current[layer] }))}>{layer}</button>
              ))}
            </div>
            <span>map.states[] → selected state {mapYear}%</span>
          </div>
          <div className="map-canvas">
            <div className="map-land-shape" />
            {mapLayers.changes && <div className="map-change-zone">changeSetIds[]</div>}
            {mapLayers.cities && <><i className="city-dot city-a" /><i className="city-dot city-b" /><i className="city-dot city-c" /></>}
            {mapLayers.conflicts && <div className="conflict-line">conflict.theaterMapId</div>}
            <span className="map-caption">boundarySetId → boundary geometry · locationIds[] → Gazetteer · sourceIds[] → Source Registry</span>
          </div>
          <input className="map-time" type="range" min="0" max="100" value={mapYear} onChange={(event) => setMapYear(Number(event.target.value))} aria-label="Состояние карты во времени" />
          <Contract show={showProvenance} label="Границы и изменения" path="ruler.map.states[] / changeSetIds[]" source="Historical Map Dataset + Boundary Change Registry" rule="Компонент не рисует историю сам: получает версионированные boundary sets, change sets, confidence и sourceIds[]." />
        </section>

        <section className="module-section reforms-module" id="state-reforms">
          <ModuleHeading index="05 · GOVERNMENT" title="State & Reforms" description="Каждая реформа показывается как причинная цепочка: проблема → механизм → кого затронуло → результат → долгосрочный эффект." />
          <div className="reform-flow">
            <article><span>Проблема</span><strong>reform.problem</strong><small>sourceIds[]</small></article>
            <span className="flow-arrow">→</span>
            <article><span>Механизм</span><strong>reform.mechanism</strong><small>legalDocumentIds[]</small></article>
            <span className="flow-arrow">→</span>
            <article><span>Немедленный результат</span><strong>reform.immediateResult</strong><small>evidenceStatus</small></article>
            <span className="flow-arrow">→</span>
            <article><span>Долгий эффект</span><strong>reform.longTermEffect</strong><small>sourceIds[]</small></article>
          </div>
          <div className="institution-diagram"><span>Institution Graph</span><strong>reform.institutionGraphId</strong><p>Node/edge dataset отображается только если структурное изменение лучше объясняется схемой.</p></div>
          <Contract show={showProvenance} label="Реформы" path="ruler.reforms[]" source="Reform Registry" rule="Ruler record хранит IDs реформ; сами ReformRecord переиспользуются в событиях, документах и страницах институций." />
        </section>

        <section className="module-section foreign-module" id="war-foreign">
          <ModuleHeading index="06 · EXTERNAL" title="War & Foreign Policy" description="Отдельная структура для конфликтов и дипломатии, потому что им нужны карты, стороны, договоры и временные связи." />
          <div className="segmented-control" role="group" aria-label="Войны или дипломатия">
            <button className={foreignMode === 'war' ? 'is-active' : ''} onClick={() => setForeignMode('war')}>Войны</button>
            <button className={foreignMode === 'diplomacy' ? 'is-active' : ''} onClick={() => setForeignMode('diplomacy')}>Дипломатия</button>
          </div>
          {foreignMode === 'war' ? (
            <div className="conflict-layout">
              <article className="conflict-main"><span>Conflict Registry</span><h3>conflict.title</h3><p>conflict.cause → conflict.objectives → conflict.outcome</p><div><b>conflict.startDate</b><b>conflict.endDate</b><b>treatyIds[]</b></div></article>
              <article><span>Стороны</span><strong>conflict.participantIds[]</strong></article>
              <article><span>Театры</span><strong>conflict.theaterMapId</strong></article>
              <article><span>Переломы</span><strong>conflict.eventIds[]</strong></article>
            </div>
          ) : (
            <div className="diplomacy-layout">
              <article><span>Diplomatic Relations Dataset</span><h3>relationIds[]</h3><p>alliance / rivalry / treaty / recognition · date range · participant polity IDs</p></article>
              <article><span>Договоры</span><strong>treatyIds[] → Document Registry</strong></article>
              <article><span>Международное положение</span><strong>diplomacy.editorialSummary</strong></article>
            </div>
          )}
          <Contract show={showProvenance} label="Войны и дипломатия" path="ruler.conflictIds[] / diplomacy.relationIds[]" source="Conflict Registry + Diplomatic Relations Dataset" rule="Страница хранит связи по ID; карты, договоры и события резолвятся из отдельных реестров." />
        </section>

        <section className="module-section economy-module" id="economy-society">
          <ModuleHeading index="07 · COUNTRY" title="Economy & Society" description="Исторические ряды используются только когда методология позволяет сравнение; остальное оформляется как подтверждённые редакционные темы." />
          <div className="metric-row">
            <article><span>Historical Series</span><strong>metric.label</strong><b>metric.value + unit</b><small>methodologyId · sourceIds[]</small></article>
            <article><span>Historical Series</span><strong>metric.label</strong><b>metric.value + unit</b><small>dateRange · comparability</small></article>
            <article><span>НЕ ПОКАЗЫВАТЬ</span><strong>Число без методики</strong><b>—</b><small>UI не создаёт псевдоточность</small></article>
          </div>
          <div className="society-split"><article><span>Социальные группы</span><strong>society.groups[]</strong><p>group.summary + change + sourceIds[]</p></article><article><span>Социальные конфликты</span><strong>society.eventIds[]</strong><p>Event Registry → same event entity used in Reign Arc</p></article></div>
          <Contract show={showProvenance} label="Исторические показатели" path="ruler.metrics[]" source="Historical Series Dataset" rule="Каждый ряд обязан иметь unit, methodologyId, dateRange, comparability и sourceIds[]. Без этого metric не допускается в UI." />
        </section>

        <section className="module-section culture-module" id="culture">
          <ModuleHeading index="08 · CULTURAL WORLD" title="Culture, Ideas & Everyday World" description="Не каталог знаменитостей, а визуальная среда периода: предметы, архитектура, книги, идеи, институции и технологии." />
          <div className="artifact-grid">
            <article className="artifact-large"><div>artifact.mediaId</div><span>Artifact Registry</span><strong>artifact.title</strong><small>date · creatorId · sourceIds[]</small></article>
            <article><div>artifact.mediaId</div><span>Architecture / object</span><strong>artifact.title</strong></article>
            <article><div>artifact.mediaId</div><span>Book / idea</span><strong>artifact.title</strong></article>
            <article><div>artifact.mediaId</div><span>Technology / everyday life</span><strong>artifact.title</strong></article>
          </div>
          <Contract show={showProvenance} label="Культурные объекты и темы" path="ruler.culture.artifactIds[] / themeIds[]" source="Artifact Registry + Topic Registry" rule="UI получает сущности через IDs; visual DNA эпохи может опираться на них, но не копирует артефакт как декоративный CSS." />
        </section>

        <section className="module-section people-module" id="people-power">
          <ModuleHeading index="09 · NETWORK" title="People & Power" description="Сеть людей, органов и отношений вокруг активной власти. Связи датированы и имеют доказательную базу." />
          <div className="network-canvas">
            <div className="network-center"><strong>ruler.id</strong><small>active authority</small></div>
            <div className="network-node node-a"><strong>personId</strong><small>relationship.type</small></div>
            <div className="network-node node-b"><strong>institutionId</strong><small>dated edge</small></div>
            <div className="network-node node-c"><strong>personId</strong><small>sourceIds[]</small></div>
            <div className="network-node node-d"><strong>personId</strong><small>startDate / endDate</small></div>
          </div>
          <Contract show={showProvenance} label="Узлы и связи власти" path="ruler.powerNetwork.nodeIds[] / edges[]" source="Person Registry + Institution Registry + Relationship Dataset" rule="На мобильном тот же dataset рендерится как список кластеров; данные не меняются вместе с визуализацией." />
        </section>

        <section className="module-section person-module" id="person">
          <ModuleHeading index="10 · BIOGRAPHY" title="The Person" description="Личная сторона власти только там, где она подтверждена источниками и помогает понимать историческое поведение или публичный образ." />
          <div className="person-layout">
            <div className="portrait-series"><div>portraitMediaIds[0]</div><div>portraitMediaIds[1]</div><div>portraitMediaIds[2]</div></div>
            <article><span>Editorial biography records</span><h3>persona.topics[0].title</h3><p>persona.topics[0].summary</p><blockquote>evidence.excerpt → documentId → exact location/page</blockquote></article>
          </div>
          <Contract show={showProvenance} label="Биографическая тема" path="ruler.persona.topics[]" source="Editorial biography records + Evidence links" rule="Каждая тема содержит evidence/sourceIds[]. Никаких автоматических психологических диагнозов или неподтверждённых бытовых деталей." />
        </section>

        <section className="module-section documents-module" id="documents">
          <ModuleHeading index="11 · EVIDENCE" title="Documents & Voices" description="Первичные источники с происхождением, оригиналом, расшифровкой и контекстом. Цитата никогда не существует отдельно от документа." />
          <div className="document-tabs" role="group" aria-label="Режим документа">
            <button className={documentMode === 'original' ? 'is-active' : ''} onClick={() => setDocumentMode('original')}>Оригинал</button>
            <button className={documentMode === 'transcription' ? 'is-active' : ''} onClick={() => setDocumentMode('transcription')}>Расшифровка</button>
            <button className={documentMode === 'context' ? 'is-active' : ''} onClick={() => setDocumentMode('context')}>Контекст</button>
          </div>
          <div className="document-viewer">
            <div className="document-sheet"><span>{documentMode === 'original' ? 'document.mediaId → original scan' : documentMode === 'transcription' ? 'document.transcription' : 'document.editorialContext'}</span><strong>document.title</strong><p>document.date · document.authorId · archive/source metadata</p></div>
            <aside><span>Excerpt</span><blockquote>document.excerpts[0].text</blockquote><small>location/page · attributionStatus · sourceId</small></aside>
          </div>
          <Contract show={showProvenance} label="Документ и цитата" path="ruler.evidence.documentIds[] → DocumentRecord" source="Document Registry + Media Library + Source Registry" rule="Excerpt хранит documentId и точное место в документе; оригинал, transcription и translation являются отдельными полями." />
        </section>

        <section className="module-section debates-module" id="debates">
          <ModuleHeading index="12 · HISTORIOGRAPHY" title="Debates, Myths & Uncertainty" description="Там, где есть реальный исторический спор, интерфейс показывает позиции и степень уверенности, а не притворяется, что существует один ответ." />
          <div className="debate-question"><span>ruler.debates[0].question</span><strong>debate.consensusNote</strong><small>confidence: debate.confidence</small></div>
          <div className="position-grid">
            <article><span>Position A</span><strong>positions[0].summary</strong><small>secondarySourceIds[]</small></article>
            <article><span>Position B</span><strong>positions[1].summary</strong><small>secondarySourceIds[]</small></article>
            <article><span>Что подтверждено</span><strong>debate.evidenceSummary</strong><small>evidenceStatus</small></article>
          </div>
          <Contract show={showProvenance} label="Историографический спор" path="ruler.debates[]" source="Editorial historiography record + Secondary Source Registry" rule="Каждая позиция связана с конкретными исследованиями; confidence относится к утверждению, а не к декоративному индикатору." />
        </section>

        <section className="module-section legacy-module" id="legacy">
          <ModuleHeading index="13 · OUTCOME" title="Legacy" description="Не абстрактные «итоги», а сравнение трёх состояний: что было получено, что изменено и что передано дальше." />
          <div className="legacy-table">
            <div className="legacy-head"><span>Измерение</span><span>Получено</span><span>Изменено</span><span>Передано дальше</span></div>
            {['territory', 'institutions', 'internationalPosition', 'society'].map((dimension) => (
              <div className="legacy-row" key={dimension}><strong>{dimension}</strong><span>inheritedState</span><span>changedState</span><span>handedOverState</span></div>
            ))}
          </div>
          <div className="memory-strip"><span>История памяти</span><strong>ruler.legacy.memory[]</strong><small>Отделена от оценки самого правления.</small></div>
          <Contract show={showProvenance} label="Наследие" path="ruler.legacy.dimensions[]" source="Editorial synthesis + linked thematic sources" rule="Каждое измерение содержит inheritedState, changedState, handedOverState, durableEffects[] и sourceIds[]." />
        </section>

        <section className="module-section transition-module" id="transition">
          <ModuleHeading index="14 · HANDOVER" title="End of Rule & Transition" description="Финал власти и мост в следующий chronology node. Именно здесь начинается переход следующего Historical Visual State." />
          <div className="transition-grid">
            <article><span>Как закончилась власть</span><h3>ruler.transition.method</h3><p>ruler.transition.summary</p></article>
            <article><span>Нерешённое</span><strong>transition.unresolvedIssueIds[]</strong><small>links to Event / Topic records</small></article>
            <article className="next-authority"><span>NEXT CHRONOLOGY NODE</span><h3>successorIds[]</h3><p>derived.nextHistoricalVisualState</p><button className="button primary">Перейти к следующему узлу</button></article>
          </div>
          <Contract show={showProvenance} label="Преемственность" path="ruler.relations.successorIds[]" source="Chronology Graph" rule="Массив поддерживает обычную преемственность, коллективную власть, политический разрыв и параллельные центры власти." />
        </section>

        <section className="module-section sources-module" id="sources">
          <ModuleHeading index="15 · PROVENANCE" title="Sources & Method" description="Источники и методика не прячутся в техническом подвале: пользователь может понять происхождение карты, числа, цитаты и спорного утверждения." />
          <div className="source-list">
            <details open><summary><span>Primary Source</span><strong>source.title</strong></summary><p>source.author · source.date · archive · locator · url/identifier · access metadata</p></details>
            <details><summary><span>Academic Secondary Source</span><strong>source.title</strong></summary><p>author · publication · year · pages · identifier · claims linked by claimIds[]</p></details>
            <details><summary><span>Map / Dataset Source</span><strong>source.title</strong></summary><p>dataset version · methodology · coverage · confidence · license</p></details>
          </div>
          <div className="verification-meta"><span>claim.evidenceStatus</span><span>ruler.editorial.lastVerifiedAt</span><span>editorialRevisionId</span></div>
          <Contract show={showProvenance} label="Источники страницы" path="ruler.sourceIds[] / claim.sourceIds[]" source="Source Registry" rule="Страница агрегирует связанные источники; дата lastVerifiedAt обновляется при содержательной проверке, а не при любом deploy." />
        </section>
      </div>

      <section className="core-system-board" id="core-system">
        <ModuleHeading index="CORE DESIGN SYSTEM" title="Одинаковые элементы во всех исторических состояниях" description="Здесь показаны базовые компоненты и семантические токены. Historical Visual State может менять разрешённые значения, но не назначение компонента." />
        <div className="component-board">
          <article><span>Primary Button</span><button className="button primary">Primary action</button><code>Button / primary</code></article>
          <article><span>Secondary Button</span><button className="button secondary">Secondary action</button><code>Button / secondary</code></article>
          <article><span>Chip / status</span><i className="role-chip">verified</i><code>Chip / status</code></article>
          <article><span>Input / search</span><input className="core-input" defaultValue="Поиск по хронологии" aria-label="Пример поля поиска" /><code>Input / search</code></article>
          <article><span>Card / surface</span><div className="mini-card"><strong>Semantic surface</strong><small>--surface-primary</small></div><code>Card / default</code></article>
          <article><span>Disclosure / provenance</span><details className="mini-details"><summary>Открыть source</summary><p>sourceIds[] → Source Registry</p></details><code>Disclosure</code></article>
        </div>
        <div className="token-board">
          {[
            ['--page-bg', 'Page background'], ['--surface-primary', 'Primary surface'], ['--surface-elevated', 'Elevated surface'], ['--text-primary', 'Primary text'], ['--text-muted', 'Muted text'], ['--accent-primary', 'Primary accent'], ['--accent-secondary', 'Secondary accent'], ['--border-emphasis', 'Emphasis border'], ['--map-land', 'Map land'], ['--map-water', 'Map water'], ['--surface-radius', 'Surface radius'], ['--shadow-character', 'Shadow character']
          ].map(([token, label]) => <article key={token}><span className="token-swatch" style={{ background: `var(${token})` }} /><strong>{label}</strong><code>{token}</code></article>)}
        </div>
      </section>

      <section className="pipeline-section" id="pipeline">
        <ModuleHeading index="CONTENT & DATA PIPELINE" title="Как информация доходит до страницы" description="Никакой исторический текст, карта или дата не должны быть зашиты в React-компонент. Компоненты получают нормализованные сущности и IDs." />
        <div className="pipeline-flow">
          <article><b>01</b><strong>Source Registry</strong><p>Книги, архивы, документы, академические исследования, datasets, карты и media provenance.</p></article>
          <article><b>02</b><strong>Entity Registries</strong><p>Ruler, Person, Institution, Event, Conflict, Reform, Document, Artifact, Location, Polity.</p></article>
          <article><b>03</b><strong>Editorial Layer</strong><p>Highlights, narrative phases, significance, summaries, debates. Claims с sourceIds[] и evidenceStatus.</p></article>
          <article><b>04</b><strong>Page Resolver</strong><p>slug → ruler/authority → linked entities → chronology → map states → module registry.</p></article>
          <article><b>05</b><strong>Historical State Resolver</strong><p>chronology context → visual layers → semantic token overrides + compositionAccent.</p></article>
          <article><b>06</b><strong>Core UI</strong><p>Одни и те же компоненты рендерят данные. Исторический слой не создаёт отдельные кнопки, карточки или mobile UX.</p></article>
        </div>
      </section>

      <footer className="system-footer"><strong>rulers-of-russia / Core System</strong><span>Interactive ruler-page skeleton · no specific ruler data</span></footer>
    </main>
  );
}
