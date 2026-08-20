'use client';

import { useMemo, useState } from 'react';

type VisualState = 'core' | 'imperial' | 'rupture' | 'monumental' | 'contemporary';
type ModuleKey =
  | 'hero'
  | 'snapshot'
  | 'starting-point'
  | 'reign-arc'
  | 'map'
  | 'state-reforms'
  | 'war-foreign'
  | 'economy-society'
  | 'culture'
  | 'people-power'
  | 'person'
  | 'documents'
  | 'debates'
  | 'legacy'
  | 'transition'
  | 'sources';

type FieldSpec = {
  label: string;
  path: string;
  source: string;
  rule: string;
};

type ModuleSpec = {
  key: ModuleKey;
  eyebrow: string;
  title: string;
  purpose: string;
  fields: FieldSpec[];
};

const visualStates: { id: VisualState; label: string; note: string }[] = [
  { id: 'core', label: 'Core', note: 'Нейтральное состояние дизайн-системы без исторического слоя.' },
  { id: 'imperial', label: 'Imperial structure', note: 'Пример слоя политической системы: меняет материал, цвет и framing, но не UX.' },
  { id: 'rupture', label: 'Historical rupture', note: 'Пример разрыва: более фрагментированный ритм для революций и переходных режимов.' },
  { id: 'monumental', label: 'Monumental state', note: 'Пример тяжёлой осевой композиции для централизованных режимов XX века.' },
  { id: 'contemporary', label: 'Contemporary', note: 'Чистый документальный слой Нового времени.' }
];

const modules: ModuleSpec[] = [
  {
    key: 'hero',
    eyebrow: '01 · Identity',
    title: 'Ruler Hero',
    purpose: 'Главный вход в правление: кто находится у власти, когда и в каком государственном контексте.',
    fields: [
      { label: 'Имя / название субъекта власти', path: 'ruler.identity.canonicalName', source: 'Редакционная карточка субъекта власти', rule: 'Берётся из канонической записи ruler. Для коллективной власти допускается название органа вместо человека.' },
      { label: 'Титул / фактическая роль', path: 'ruler.identity.primaryTitle', source: 'Редакционная карточка + историческая верификация', rule: 'Показывается реальная роль в рассматриваемый период, а не универсальный современный ярлык.' },
      { label: 'Период фактической власти', path: 'ruler.reign.startDate / endDate', source: 'Хронологическая запись власти', rule: 'Отдельно от годов жизни. Поддерживает неполные даты и спорные границы.' },
      { label: 'Главный визуальный материал', path: 'ruler.media.heroAssetId', source: 'Media Library → artwork / portrait / documentary image', rule: 'ID ведёт на лицензированный или public-domain asset с provenance. Сам компонент не хранит URL вручную.' },
      { label: 'Короткая формула правления', path: 'ruler.editorial.oneLineSignificance', source: 'Редакционная статья', rule: '1–2 предложения. Не генерируется автоматически при рендере страницы.' }
    ]
  },
  {
    key: 'snapshot',
    eyebrow: '02 · Orientation',
    title: 'Reign Snapshot',
    purpose: 'Быстрое понимание политической конфигурации и главных характеристик правления.',
    fields: [
      { label: 'Длительность', path: 'derived.reignDuration', source: 'Вычисляется из reign.startDate / endDate', rule: 'Derived field: UI получает уже нормализованную длительность, учитывая неполные даты.' },
      { label: 'Способ прихода к власти', path: 'ruler.accession.method', source: 'Структурированная историческая запись', rule: 'enum + редакционное пояснение: наследование, переворот, выборы, назначение, революция и др.' },
      { label: 'Предшествующая власть', path: 'ruler.relations.predecessorIds[]', source: 'Chronology graph', rule: 'Может содержать несколько записей при спорной/параллельной власти.' },
      { label: 'Ключевые характеристики', path: 'ruler.snapshot.highlights[]', source: 'Редакционная разметка страницы', rule: '3–5 подтверждённых тезисов; каждый имеет sourceIds[].' }
    ]
  },
  {
    key: 'starting-point',
    eyebrow: '03 · Context',
    title: 'Starting Point',
    purpose: 'Показывает, какую страну и какие незавершённые процессы субъект власти получил в начале периода.',
    fields: [
      { label: 'Контекст прихода', path: 'ruler.accession.context', source: 'Редакционный текст + primary/secondary sources', rule: 'Короткий причинный контекст; длинное объяснение уходит в detail panel.' },
      { label: 'Состояние государства', path: 'ruler.startingPoint.conditions[]', source: 'Нормализованные тематические записи', rule: 'Экономика, война, институты, общество и другие dimensions подключаются только если есть данные.' },
      { label: 'Стартовое состояние карты', path: 'ruler.map.startStateId', source: 'Historical Map Dataset', rule: 'Ссылка на версионированный снимок границ и политических сущностей.' },
      { label: 'Незавершённые процессы', path: 'ruler.startingPoint.inheritedIssues[]', source: 'Editorial chronology links', rule: 'Каждый issue может ссылаться на событие предыдущего периода.' }
    ]
  },
  {
    key: 'reign-arc',
    eyebrow: '04 · Narrative',
    title: 'Reign Arc',
    purpose: 'Не список всех дат, а драматургия правления через крупные фазы и переломы.',
    fields: [
      { label: 'Фазы правления', path: 'ruler.reignArc.phases[]', source: 'Редакционная структура страницы', rule: '5–10 фаз; каждая имеет start/end, summary, eventIds[], mediaIds[] и sourceIds[].' },
      { label: 'Переломные события', path: 'phase.eventIds[]', source: 'Event Registry', rule: 'Событие хранится один раз и может использоваться в timeline, карте и тематических модулях.' },
      { label: 'Почему это перелом', path: 'phase.significance', source: 'Редакционный текст', rule: 'Отдельное поле, чтобы UI не пытался выводить значимость из заголовка события.' }
    ]
  },
  {
    key: 'map',
    eyebrow: '05 · Geography',
    title: 'Territory & Map',
    purpose: 'Сравнивает территорию и географию власти во времени и синхронизируется с событиями.',
    fields: [
      { label: 'Состояния территории', path: 'ruler.map.states[]', source: 'Historical Map Dataset', rule: 'Каждое состояние содержит date, boundarySetId, polityIds[] и confidence metadata.' },
      { label: 'Присоединения / утраты', path: 'map.changeSetIds[]', source: 'Boundary Change Registry', rule: 'Изменение связано с treaty/event/source, а не рисуется вручную в компоненте.' },
      { label: 'Города и точки событий', path: 'map.locationIds[]', source: 'Gazetteer + Event Registry', rule: 'Координаты нормализуются отдельно; UI получает locationId.' },
      { label: 'Источники границ', path: 'boundarySet.sourceIds[]', source: 'Source Registry', rule: 'Обязательны; древние/спорные границы имеют confidence и displayMode.' }
    ]
  },
  {
    key: 'state-reforms',
    eyebrow: '06 · Government',
    title: 'State & Reforms',
    purpose: 'Показывает изменение институтов через проблему, механизм реформы и последствия.',
    fields: [
      { label: 'Реформы', path: 'ruler.reforms[]', source: 'Reform Registry', rule: 'Каждая запись: problem, mechanism, affectedGroups, immediateResult, longTermEffect, sourceIds[].' },
      { label: 'Схема институтов', path: 'reform.institutionGraphId', source: 'Institution Graph Dataset', rule: 'Подключается только когда изменение структуры государства лучше показать схемой.' }
    ]
  },
  {
    key: 'war-foreign',
    eyebrow: '07 · External',
    title: 'War & Foreign Policy',
    purpose: 'Связывает войны, дипломатию, договоры и изменение международного положения России.',
    fields: [
      { label: 'Войны', path: 'ruler.conflicts[]', source: 'Conflict Registry', rule: 'Стороны, даты, цели, eventIds[], theaterMapId, outcome, treatyIds[], sourceIds[].' },
      { label: 'Договоры и союзы', path: 'ruler.diplomacy.relationIds[]', source: 'Diplomatic Relations Dataset', rule: 'Отдельная сущность, используемая также картой и событиями.' }
    ]
  },
  {
    key: 'economy-society',
    eyebrow: '08 · Country',
    title: 'Economy & Society',
    purpose: 'Показывает изменения внутри страны без псевдоточных метрик и dashboard-эффекта.',
    fields: [
      { label: 'Показатели', path: 'ruler.metrics[]', source: 'Historical Series Dataset', rule: 'Только сопоставимые ряды с unit, methodology, dateRange и sourceIds[].' },
      { label: 'Социальные группы', path: 'ruler.society.groups[]', source: 'Editorial topic records', rule: 'Описание положения и изменений; не вычисляется автоматически из статистики.' },
      { label: 'Крупные конфликты', path: 'ruler.society.eventIds[]', source: 'Event Registry', rule: 'Одна и та же сущность может появляться в Reign Arc и карте.' }
    ]
  },
  {
    key: 'culture',
    eyebrow: '09 · Cultural world',
    title: 'Culture, Ideas & Everyday World',
    purpose: 'Показывает культурную среду периода как систему, а не каталог известных имён.',
    fields: [
      { label: 'Культурные объекты', path: 'ruler.culture.artifactIds[]', source: 'Artifact Registry', rule: 'Архитектура, книги, произведения, технологии, предметы — с date, creator, mediaId, sourceIds[].' },
      { label: 'Идеи и институции', path: 'ruler.culture.themeIds[]', source: 'Topic Registry', rule: 'Тематические связи между объектами; используются для редакционной композиции.' }
    ]
  },
  {
    key: 'people-power',
    eyebrow: '10 · Network',
    title: 'People & Power',
    purpose: 'Показывает реальную сеть влияния вокруг власти и её изменение во времени.',
    fields: [
      { label: 'Люди и органы', path: 'ruler.powerNetwork.nodeIds[]', source: 'Person / Institution Registry', rule: 'Каждый node хранится отдельно и переиспользуется на других страницах.' },
      { label: 'Связи', path: 'ruler.powerNetwork.edges[]', source: 'Relationship Dataset', rule: 'type, fromId, toId, startDate, endDate, summary, sourceIds[].' }
    ]
  },
  {
    key: 'person',
    eyebrow: '11 · Biography',
    title: 'The Person',
    purpose: 'Личность, привычки и образ правителя только там, где это исторически подтверждено и значимо.',
    fields: [
      { label: 'Биографические темы', path: 'ruler.persona.topics[]', source: 'Editorial biography records', rule: 'Каждая тема имеет evidence/sourceIds[]; никаких диагнозов и автоматической психологии.' },
      { label: 'Портреты разных лет', path: 'ruler.persona.portraitMediaIds[]', source: 'Media Library', rule: 'Media record содержит автора, дату, права, provenance и sourceIds[].' }
    ]
  },
  {
    key: 'documents',
    eyebrow: '12 · Evidence',
    title: 'Documents & Voices',
    purpose: 'Даёт первичным источникам говорить внутри страницы и показывает происхождение каждого фрагмента.',
    fields: [
      { label: 'Документы', path: 'ruler.evidence.documentIds[]', source: 'Document Registry', rule: 'Манифест, письмо, дневник, речь, газета, фото, кинохроника и др.' },
      { label: 'Цитаты', path: 'document.excerpts[]', source: 'Конкретный документ', rule: 'Excerpt всегда привязан к documentId, location/page и attributionStatus.' },
      { label: 'Расшифровка / перевод', path: 'document.transcription / translation', source: 'Редакционная или опубликованная транскрипция', rule: 'Хранится отдельно от изображения оригинала и имеет собственную source metadata.' }
    ]
  },
  {
    key: 'debates',
    eyebrow: '13 · Historiography',
    title: 'Debates, Myths & Uncertainty',
    purpose: 'Показывает спорные места истории, версии и уровень уверенности вместо искусственного единственного ответа.',
    fields: [
      { label: 'Исторический вопрос', path: 'ruler.debates[]', source: 'Editorial historiography record', rule: 'question, positions[], consensusNote, confidence, sourceIds[].' },
      { label: 'Версии исследователей', path: 'debate.positions[]', source: 'Secondary Source Registry', rule: 'Каждая позиция связана с конкретным исследованием/автором.' }
    ]
  },
  {
    key: 'legacy',
    eyebrow: '14 · Outcome',
    title: 'Legacy',
    purpose: 'Сравнивает, что власть получила, что изменила и что реально оставила следующему периоду.',
    fields: [
      { label: 'Измерения наследия', path: 'ruler.legacy.dimensions[]', source: 'Редакционный synthesis', rule: 'dimension, inheritedState, changedState, handedOverState, durableEffects[], sourceIds[].' },
      { label: 'История памяти', path: 'ruler.legacy.memory[]', source: 'Historiography / cultural reception records', rule: 'Отдельно от оценки самого правления.' }
    ]
  },
  {
    key: 'transition',
    eyebrow: '15 · Handover',
    title: 'End of Rule & Transition',
    purpose: 'Объясняет, как закончилась власть и какой политический субъект появляется следующим.',
    fields: [
      { label: 'Способ окончания власти', path: 'ruler.transition.method', source: 'Chronology record', rule: 'death, abdication, overthrow, election loss, dissolution, transfer и др.' },
      { label: 'Следующие субъекты власти', path: 'ruler.relations.successorIds[]', source: 'Chronology graph', rule: 'Массив, а не одно поле: поддерживает распад режима и параллельные ветви.' },
      { label: 'Следующий визуальный state', path: 'derived.nextHistoricalVisualState', source: 'Historical State Resolver', rule: 'Вычисляется из следующего chronology node, а не задаётся вручную в UI.' }
    ]
  },
  {
    key: 'sources',
    eyebrow: '16 · Provenance',
    title: 'Sources & Method',
    purpose: 'Единое место для источников, методологии, спорности данных и даты последней проверки.',
    fields: [
      { label: 'Источники страницы', path: 'ruler.sourceIds[]', source: 'Source Registry', rule: 'Primary, academic secondary, dataset, archive, museum, map source — типизированные записи.' },
      { label: 'Статус утверждений', path: 'claim.evidenceStatus', source: 'Editorial verification layer', rule: 'verified / approximate / disputed / attributed.' },
      { label: 'Дата проверки', path: 'ruler.editorial.lastVerifiedAt', source: 'Editorial workflow', rule: 'Обновляется при содержательной проверке, а не при любом deploy.' }
    ]
  }
];

function FieldList({ fields }: { fields: FieldSpec[] }) {
  return (
    <div className="field-list">
      {fields.map((field) => (
        <details className="field-row" key={field.path}>
          <summary>
            <span>{field.label}</span>
            <code>{field.path}</code>
          </summary>
          <div className="field-detail">
            <p><strong>Источник:</strong> {field.source}</p>
            <p><strong>Правило загрузки:</strong> {field.rule}</p>
          </div>
        </details>
      ))}
    </div>
  );
}

function DataPill({ children }: { children: React.ReactNode }) {
  return <span className="data-pill">{children}</span>;
}

export function CoreSystemPrototype() {
  const [visualState, setVisualState] = useState<VisualState>('core');
  const [activeModule, setActiveModule] = useState<ModuleKey>('hero');
  const [yearPosition, setYearPosition] = useState(46);
  const [mapLayers, setMapLayers] = useState({ borders: true, changes: true, cities: true, conflicts: false });

  const activeSpec = useMemo(() => modules.find((module) => module.key === activeModule) ?? modules[0], [activeModule]);
  const currentState = visualStates.find((state) => state.id === visualState) ?? visualStates[0];

  return (
    <main className="core-prototype" data-visual-state={visualState}>
      <header className="system-header">
        <div className="brand-lockup">
          <span className="brand-mark">РР</span>
          <div>
            <strong>Правители России</strong>
            <span>Core System / interactive architecture page</span>
          </div>
        </div>
        <nav className="header-nav" aria-label="Core navigation">
          <a href="#modules">Модули</a>
          <a href="#tokens">Design tokens</a>
          <a href="#sources">Data pipeline</a>
        </nav>
      </header>

      <section className="prototype-hero">
        <div className="prototype-hero-copy">
          <p className="eyebrow">CORE DESIGN SYSTEM · NO SPECIFIC RULER</p>
          <h1>Одна страница.<br />Много исторических состояний.</h1>
          <p className="lede">Это не макет конкретного правителя. Это рабочая страница-контракт: каждый видимый элемент связан с будущим полем данных, источником и правилом загрузки.</p>
          <div className="hero-actions">
            <a className="button primary" href="#modules">Смотреть модули</a>
            <button className="button secondary" onClick={() => setActiveModule('map')}>Открыть карту</button>
          </div>
        </div>
        <div className="identity-frame" aria-label="Ruler Hero data contract">
          <span className="frame-label">Ruler Hero / visual media frame</span>
          <div className="portrait-contract">
            <span>MEDIA SLOT</span>
            <strong>ruler.media.heroAssetId</strong>
            <small>Media Library → verified asset → responsive image pipeline</small>
          </div>
          <div className="identity-contract">
            <DataPill>ruler.identity.primaryTitle</DataPill>
            <h2>ruler.identity.canonicalName</h2>
            <p>ruler.reign.startDate — ruler.reign.endDate</p>
            <small>ruler.editorial.oneLineSignificance</small>
          </div>
        </div>
      </section>

      <section className="state-lab" aria-labelledby="state-lab-title">
        <div>
          <p className="eyebrow">Historical Visual State Engine</p>
          <h2 id="state-lab-title">Переключи визуальное состояние</h2>
          <p>{currentState.note}</p>
        </div>
        <div className="state-switcher" role="group" aria-label="Visual state selector">
          {visualStates.map((state) => (
            <button key={state.id} className={visualState === state.id ? 'is-active' : ''} onClick={() => setVisualState(state.id)}>
              {state.label}
            </button>
          ))}
        </div>
      </section>

      <section className="chronology-shell" aria-labelledby="chronology-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Global Chronology Shell</p>
            <h2 id="chronology-title">Постоянный позвоночник продукта</h2>
          </div>
          <DataPill>chronology.nodes[] + relations[]</DataPill>
        </div>
        <div className="timeline-demo">
          <div className="timeline-labels"><span>предыдущий узел</span><strong>активный период</strong><span>следующий узел</span></div>
          <input aria-label="Chronology position" type="range" min="0" max="100" value={yearPosition} onChange={(event) => setYearPosition(Number(event.target.value))} />
          <div className="timeline-readout">
            <span>Позиция: {yearPosition}%</span>
            <span>Источник: Chronology Graph</span>
            <span>Resolver: chronology node → Historical Visual State</span>
          </div>
        </div>
      </section>

      <section className="module-workbench" id="modules">
        <aside className="module-index">
          <p className="eyebrow">Module Registry</p>
          <h2>Все модули страницы</h2>
          <div className="module-tabs" role="tablist" aria-label="Module selector">
            {modules.map((module) => (
              <button key={module.key} role="tab" aria-selected={activeModule === module.key} className={activeModule === module.key ? 'is-active' : ''} onClick={() => setActiveModule(module.key)}>
                <span>{module.eyebrow}</span>
                <strong>{module.title}</strong>
              </button>
            ))}
          </div>
        </aside>

        <article className="module-stage" aria-live="polite">
          <div className="module-stage-header">
            <div>
              <p className="eyebrow">{activeSpec.eyebrow}</p>
              <h2>{activeSpec.title}</h2>
              <p>{activeSpec.purpose}</p>
            </div>
            <span className="status-chip">registered module</span>
          </div>

          {activeModule === 'map' ? (
            <div className="map-contract">
              <div className="map-toolbar">
                {Object.entries(mapLayers).map(([key, enabled]) => (
                  <button key={key} className={enabled ? 'is-active' : ''} onClick={() => setMapLayers((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))}>
                    {key}
                  </button>
                ))}
              </div>
              <div className="map-canvas">
                <div className="map-land-shape" />
                <span className="map-caption">Historical Map Engine · boundarySetId + changeSetIds[] + locationIds[]</span>
              </div>
            </div>
          ) : activeModule === 'reign-arc' ? (
            <div className="arc-contract">
              {[1, 2, 3, 4, 5].map((phase) => (
                <button key={phase} className={phase === 3 ? 'is-active' : ''}>
                  <span>phase[{phase - 1}].dateRange</span>
                  <strong>phase[{phase - 1}].title</strong>
                  <small>eventIds[] → Event Registry</small>
                </button>
              ))}
            </div>
          ) : activeModule === 'people-power' ? (
            <div className="network-contract">
              <div className="network-center">active authority<br /><code>ruler.id</code></div>
              <div className="network-node">personId<br /><small>Relationship Dataset</small></div>
              <div className="network-node">institutionId<br /><small>Institution Registry</small></div>
              <div className="network-node">personId<br /><small>dated edge</small></div>
            </div>
          ) : (
            <div className="content-contract-grid">
              <div className="content-contract primary-contract">
                <span>PRIMARY CONTENT</span>
                <strong>{activeSpec.fields[0]?.path}</strong>
                <p>{activeSpec.fields[0]?.source}</p>
              </div>
              <div className="content-contract">
                <span>SUPPORTING CONTENT</span>
                <strong>{activeSpec.fields[1]?.path ?? 'sourceIds[]'}</strong>
                <p>{activeSpec.fields[1]?.source ?? 'Source Registry'}</p>
              </div>
              <div className="content-contract media-contract">
                <span>MEDIA / DATA VISUAL</span>
                <strong>linked entity IDs</strong>
                <p>Media / Map / Event / Document Registry depending on module</p>
              </div>
            </div>
          )}

          <div className="data-contract">
            <div className="data-contract-title">
              <div>
                <p className="eyebrow">Data contract</p>
                <h3>Что именно сюда приходит</h3>
              </div>
              <span>{activeSpec.fields.length} fields shown</span>
            </div>
            <FieldList fields={activeSpec.fields} />
          </div>
        </article>
      </section>

      <section className="token-board" id="tokens">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Core Design System</p>
            <h2>Семантические токены, которые используют компоненты</h2>
            <p>Компоненты обращаются к роли токена, а не к конкретной эпохе. Historical Visual State меняет значения разрешённых токенов.</p>
          </div>
        </div>
        <div className="token-grid">
          {[
            ['--page-bg', 'Page background'], ['--surface-primary', 'Primary surface'], ['--surface-elevated', 'Elevated surface'], ['--text-primary', 'Primary text'], ['--text-muted', 'Muted text'], ['--accent-primary', 'Primary accent'], ['--accent-secondary', 'Secondary accent'], ['--border-emphasis', 'Emphasis border'], ['--map-land', 'Map land'], ['--map-water', 'Map water'], ['--surface-radius', 'Surface radius'], ['--shadow-character', 'Shadow character']
          ].map(([token, label]) => (
            <div className="token-card" key={token}>
              <span className="token-swatch" style={{ background: `var(${token})` }} />
              <strong>{label}</strong>
              <code>{token}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="component-board">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Core Components</p>
            <h2>Одинаковые функции при любой эпохе</h2>
          </div>
        </div>
        <div className="component-demo-grid">
          <div className="component-demo"><span>Primary Button</span><button className="button primary">Primary action</button></div>
          <div className="component-demo"><span>Secondary Button</span><button className="button secondary">Secondary action</button></div>
          <div className="component-demo"><span>Chip / Tag</span><DataPill>verified source</DataPill></div>
          <div className="component-demo"><span>Input / Search</span><input className="core-input" defaultValue="Поиск по хронологии" aria-label="Search demo" /></div>
          <div className="component-demo"><span>Card</span><div className="mini-card"><strong>Semantic surface</strong><small>Uses --surface-primary</small></div></div>
          <div className="component-demo"><span>Popover / details</span><details className="mini-details"><summary>Открыть provenance</summary><p>sourceIds[] → Source Registry</p></details></div>
        </div>
      </section>

      <section className="pipeline" id="sources">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Content & Data Pipeline</p>
            <h2>Откуда страница получает информацию</h2>
            <p>Никакой текст внутри модулей не должен быть «зашит» в компонент. Компонент получает нормализованные сущности по ID.</p>
          </div>
        </div>
        <div className="pipeline-flow">
          <div><span>01</span><strong>Source Registry</strong><p>Книги, архивы, документы, академические работы, datasets, карты, media provenance.</p></div>
          <div><span>02</span><strong>Entity Registries</strong><p>Ruler, Person, Institution, Event, Conflict, Reform, Document, Artifact, Location.</p></div>
          <div><span>03</span><strong>Editorial Layer</strong><p>Синтез, narrative phases, significance, highlights, debates. Каждый claim хранит sourceIds[].</p></div>
          <div><span>04</span><strong>Page Resolver</strong><p>По slug получает ruler → связанные сущности → chronology → map states → Historical Visual State.</p></div>
          <div><span>05</span><strong>Module Registry</strong><p>Определяет, какие модули нужны этой странице и какие варианты композиции допустимы.</p></div>
          <div><span>06</span><strong>Core UI</strong><p>Рендерит одни и те же компоненты через semantic tokens. Эпоха не владеет компонентами.</p></div>
        </div>
      </section>

      <footer className="system-footer">
        <div><strong>rulers-of-russia</strong><span>interactive architecture foundation</span></div>
        <p>Следующий слой работы: утверждение внутренней композиции каждого зарегистрированного модуля и подключение реальной content schema.</p>
      </footer>
    </main>
  );
}
