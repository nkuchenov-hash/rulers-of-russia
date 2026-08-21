'use client';

import { useState, type ReactNode } from 'react';
import {
  corePassports,
  type CoreInspectableId,
  type CoreModuleId
} from '@/modules/core/inspectorPassports';
import {
  inspectorTrees,
  type InspectorTreeNode
} from '@/modules/core/inspectorStructure';
import {
  defaultHeroGradientSettings,
  type HeroGradientSettings
} from '@/modules/hero/heroVisualContract';
import styles from '@/modules/core/InspectorLayers.module.css';

export interface ThematicCardSize {
  width: number;
  height: number;
}

export const defaultThematicCardSize: ThematicCardSize = {
  width: 340,
  height: 300
};

export interface InspectorTuning {
  gradient: HeroGradientSettings;
  heroImageX: number;
  heroImageY: number;
  heroDatesSize: number;
  heroNameSize: number;
  heroSummarySize: number;
  heroSummaryWidth: number;
  heroMetaSize: number;
  keyEventsWidth: number;
  keyEventFontSize: number;
  heroActionSize: number;
  thematicCardSizes: Record<string, ThematicCardSize>;
}

export const defaultInspectorTuning: InspectorTuning = {
  gradient: defaultHeroGradientSettings,
  heroImageX: 50,
  heroImageY: 50,
  heroDatesSize: 22,
  heroNameSize: 104,
  heroSummarySize: 17,
  heroSummaryWidth: 620,
  heroMetaSize: 13,
  keyEventsWidth: 320,
  keyEventFontSize: 12,
  heroActionSize: 40,
  thematicCardSizes: {
    reforms: { ...defaultThematicCardSize },
    conflicts: { ...defaultThematicCardSize },
    people: { ...defaultThematicCardSize },
    legacy: { ...defaultThematicCardSize }
  }
};

const pageModuleOrder: CoreModuleId[] = [
  'background',
  'header',
  'historical-rail',
  'hero',
  'page-tabs',
  'territory',
  'map',
  'facts',
  'thematic-card',
  'reign-timeline'
];

const pageTree: InspectorTreeNode = {
  label: 'Страница правителя',
  children: pageModuleOrder.map((moduleId) => inspectorTrees[moduleId])
};

function treeKey(node: InspectorTreeNode, depth: number) {
  return `${depth}:${node.label}:${node.targetSelector ?? ''}`;
}

function initialExpandedLayers() {
  const keys = new Set<string>();
  keys.add(treeKey(pageTree, 0));
  pageTree.children?.forEach((node) => keys.add(treeKey(node, 1)));
  return keys;
}

function LayerTree({
  node,
  selectedId,
  depth,
  expanded,
  onToggle,
  onSelect
}: {
  node: InspectorTreeNode;
  selectedId: CoreInspectableId;
  depth: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (id: CoreInspectableId, targetSelector?: string) => void;
}) {
  const key = treeKey(node, depth);
  const hasChildren = Boolean(node.children?.length);
  const isOpen = hasChildren ? expanded.has(key) : false;
  const isActive = node.id === selectedId;

  return (
    <div className={styles.treeBranch}>
      <button
        type="button"
        className={`${styles.treeRow} ${isActive ? styles.active : ''} ${!node.id ? styles.group : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (node.id) onSelect(node.id, node.targetSelector);
          if (hasChildren) onToggle(key);
        }}
      >
        <span
          className={styles.chevron}
          onClick={(event) => {
            if (!hasChildren) return;
            event.stopPropagation();
            onToggle(key);
          }}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </span>
        <span className={styles.treeLabel}>{node.label}</span>
        {node.id ? <span className={styles.layerIcon} aria-hidden="true" /> : <span />}
      </button>

      {hasChildren && isOpen && (
        <div className={styles.children}>
          {node.children!.map((child, index) => (
            <LayerTree
              key={`${key}:${index}:${child.label}`}
              node={child}
              selectedId={selectedId}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RangeSetting({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className={styles.settingRow}>
      <label>{label}</label>
      <div className={styles.valuePair}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>{value}{suffix}</output>
      </div>
    </div>
  );
}

function SettingsPanel({
  selectedId,
  selectedThematicCardId,
  tuning,
  onChange
}: {
  selectedId: CoreInspectableId;
  selectedThematicCardId: string | null;
  tuning: InspectorTuning;
  onChange: (next: InspectorTuning) => void;
}) {
  const patch = (partial: Partial<InspectorTuning>) => onChange({ ...tuning, ...partial });
  const patchGradient = (partial: Partial<HeroGradientSettings>) =>
    patch({ gradient: { ...tuning.gradient, ...partial } });

  let controls: ReactNode = null;

  if (selectedId === 'hero-image') {
    controls = (
      <>
        <RangeSetting label="Фокус по горизонтали" value={tuning.heroImageX} min={0} max={100} suffix="%" onChange={(value) => patch({ heroImageX: value })} />
        <RangeSetting label="Фокус по вертикали" value={tuning.heroImageY} min={0} max={100} suffix="%" onChange={(value) => patch({ heroImageY: value })} />
      </>
    );
  } else if (selectedId === 'hero-gradient') {
    controls = (
      <>
        <div className={styles.settingRow}>
          <label>Градиент включён</label>
          <input type="checkbox" checked={tuning.gradient.enabled} onChange={(event) => patchGradient({ enabled: event.target.checked })} />
        </div>
        <div className={styles.settingRow}>
          <label>Направление</label>
          <select value={tuning.gradient.direction} onChange={(event) => patchGradient({ direction: event.target.value as HeroGradientSettings['direction'] })}>
            <option value="to-right">Слева направо</option>
            <option value="to-left">Справа налево</option>
          </select>
        </div>
        <RangeSetting label="Ширина" value={tuning.gradient.widthPercent} min={30} max={82} suffix="%" onChange={(value) => patchGradient({ widthPercent: value })} />
        <RangeSetting label="Размытие" value={tuning.gradient.blurPx} min={0} max={24} suffix="px" onChange={(value) => patchGradient({ blurPx: value })} />
        <RangeSetting label="Мягкость края" value={tuning.gradient.edgeSoftnessPercent} min={0} max={30} suffix="%" onChange={(value) => patchGradient({ edgeSoftnessPercent: value })} />
      </>
    );
  } else if (selectedId === 'hero-dates') {
    controls = <RangeSetting label="Размер текста" value={tuning.heroDatesSize} min={14} max={32} suffix="px" onChange={(value) => patch({ heroDatesSize: value })} />;
  } else if (selectedId === 'hero-name') {
    controls = <RangeSetting label="Размер имени" value={tuning.heroNameSize} min={72} max={132} suffix="px" onChange={(value) => patch({ heroNameSize: value })} />;
  } else if (selectedId === 'hero-summary') {
    controls = (
      <>
        <RangeSetting label="Размер текста" value={tuning.heroSummarySize} min={13} max={24} suffix="px" onChange={(value) => patch({ heroSummarySize: value })} />
        <RangeSetting label="Максимальная ширина" value={tuning.heroSummaryWidth} min={360} max={760} suffix="px" onChange={(value) => patch({ heroSummaryWidth: value })} />
      </>
    );
  } else if (selectedId === 'hero-meta-item') {
    controls = <RangeSetting label="Размер значения" value={tuning.heroMetaSize} min={10} max={18} suffix="px" onChange={(value) => patch({ heroMetaSize: value })} />;
  } else if (selectedId === 'key-events') {
    controls = <RangeSetting label="Ширина карточки" value={tuning.keyEventsWidth} min={260} max={430} suffix="px" onChange={(value) => patch({ keyEventsWidth: value })} />;
  } else if (selectedId === 'key-event-row') {
    controls = <RangeSetting label="Размер строки" value={tuning.keyEventFontSize} min={10} max={17} suffix="px" onChange={(value) => patch({ keyEventFontSize: value })} />;
  } else if (selectedId === 'hero-action') {
    controls = <RangeSetting label="Размер кнопки" value={tuning.heroActionSize} min={32} max={56} suffix="px" onChange={(value) => patch({ heroActionSize: value })} />;
  } else if (selectedId === 'thematic-card' && selectedThematicCardId) {
    const currentSize = tuning.thematicCardSizes[selectedThematicCardId] ?? defaultThematicCardSize;
    const patchCardSize = (partial: Partial<ThematicCardSize>) => patch({
      thematicCardSizes: {
        ...tuning.thematicCardSizes,
        [selectedThematicCardId]: { ...currentSize, ...partial }
      }
    });

    controls = (
      <>
        <RangeSetting label="Ширина карточки" value={currentSize.width} min={260} max={560} suffix="px" onChange={(value) => patchCardSize({ width: value })} />
        <RangeSetting label="Высота карточки" value={currentSize.height} min={220} max={520} suffix="px" onChange={(value) => patchCardSize({ height: value })} />
      </>
    );
  }

  return (
    <section className={styles.settingsPanel}>
      <div className={styles.panelSectionHead}>
        <h3>Настройки</h3>
        <span>{selectedThematicCardId && selectedId === 'thematic-card' ? `карточка: ${selectedThematicCardId}` : 'выбранный элемент'}</span>
      </div>
      {controls ?? (
        <p className={styles.readOnlyNote}>
          У этого элемента нет свободной визуальной настройки. Его значение или поведение задаётся данными и правилами модуля.
        </p>
      )}
    </section>
  );
}

export function CoreInspectorDrawer({
  selectedId,
  selectedThematicCardId,
  onClose,
  onSelectLayer,
  tuning,
  onTuningChange
}: {
  selectedId: CoreInspectableId | null;
  selectedThematicCardId: string | null;
  onClose: () => void;
  onSelectLayer: (id: CoreInspectableId, targetSelector?: string) => void;
  tuning: InspectorTuning;
  onTuningChange: (next: InspectorTuning) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(initialExpandedLayers);

  if (!selectedId) return null;

  const passport = corePassports[selectedId];
  if (!passport) return null;

  const sections: Array<[string, string[]]> = [
    ['Как работает', passport.flow],
    ['Данные', passport.data],
    ['Откуда берётся', passport.sources],
    ['Действия пользователя', passport.interactions],
    ['Если данных нет', passport.fallback],
    ['Адаптивность', passport.responsive],
    ['Что может менять эпоха', passport.hvs],
    ['Чем собирается', passport.tools]
  ];

  function toggle(key: string) {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }

  return (
    <>
      <aside className="inspector-layers-panel" aria-label="Слои страницы">
        <header className="inspector-layers-head">
          <div>
            <small>СТРУКТУРА СТРАНИЦЫ</small>
            <h2>Слои</h2>
          </div>
        </header>
        <div className={styles.layersTreeScroll}>
          <LayerTree
            node={pageTree}
            selectedId={selectedId}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelectLayer}
          />
        </div>
      </aside>

      <aside className="inspector-properties-panel" aria-label={`Свойства: ${passport.label}`}>
        <header className="inspector-properties-head">
          <div>
            <small>{passport.kind === 'module' ? 'МОДУЛЬ' : 'ЭЛЕМЕНТ'}</small>
            {passport.parent && <span className="inspector-parent">{passport.parent}</span>}
            <h2>{passport.label}{selectedId === 'thematic-card' && selectedThematicCardId ? ` · ${selectedThematicCardId}` : ''}</h2>
          </div>
          <button onClick={onClose} aria-label="Закрыть Inspector">×</button>
        </header>

        <SettingsPanel
          selectedId={selectedId}
          selectedThematicCardId={selectedThematicCardId}
          tuning={tuning}
          onChange={onTuningChange}
        />

        <section className="inspector-properties-summary">
          <p><b>Что это</b>{passport.what}</p>
          <p><b>Где находится</b>{passport.where}</p>
        </section>

        <div className="inspector-properties-body">
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
