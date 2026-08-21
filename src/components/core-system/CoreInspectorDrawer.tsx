'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  corePassports,
  type CoreInspectableId
} from '@/modules/core/inspectorPassports';
import {
  inspectorTrees,
  owningModuleFor,
  type InspectorTreeNode
} from '@/modules/core/inspectorStructure';
import {
  defaultHeroGradientSettings,
  type HeroGradientSettings
} from '@/modules/hero/heroVisualContract';
import styles from '@/modules/core/InspectorLayers.module.css';

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
  heroActionSize: 40
};

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
  const key = `${depth}:${node.label}:${node.targetSelector ?? ''}`;
  const hasChildren = Boolean(node.children?.length);
  const isOpen = hasChildren ? expanded.has(key) : false;
  const isActive = node.id === selectedId;

  return (
    <div className={styles.treeBranch}>
      <button
        type="button"
        className={`${styles.treeRow} ${isActive ? styles.active : ''} ${!node.id ? styles.group : ''}`}
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => {
          if (node.id) onSelect(node.id, node.targetSelector);
          else if (hasChildren) onToggle(key);
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
        <div className={styles.children} style={{ marginLeft: 17 + depth * 18 }}>
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
  tuning,
  onChange
}: {
  selectedId: CoreInspectableId;
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
  }

  return (
    <section className={styles.settingsPanel}>
      <h3>Настройки элемента</h3>
      {controls ?? (
        <p className={styles.readOnlyNote}>
          У этого элемента сейчас нет свободной визуальной ручки: его значение или поведение задаётся данными и правилами модуля. Здесь всё равно остаётся его отдельный паспорт; когда для элемента появятся допустимые настройки, controls подключаются именно сюда, а не создаются в обход системы.
        </p>
      )}
    </section>
  );
}

export function CoreInspectorDrawer({
  selectedId,
  onClose,
  onSelectLayer,
  tuning,
  onTuningChange
}: {
  selectedId: CoreInspectableId | null;
  onClose: () => void;
  onSelectLayer: (id: CoreInspectableId, targetSelector?: string) => void;
  tuning: InspectorTuning;
  onTuningChange: (next: InspectorTuning) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const passport = selectedId ? corePassports[selectedId] : null;
  const moduleId = selectedId ? owningModuleFor(selectedId) : null;
  const tree = moduleId ? inspectorTrees[moduleId] : null;

  const initialExpansion = useMemo(() => {
    if (!tree) return [] as string[];
    const keys: string[] = [];
    const walk = (current: InspectorTreeNode, depth: number) => {
      if (current.children?.length) {
        keys.push(`${depth}:${current.label}:${current.targetSelector ?? ''}`);
        current.children.forEach((child) => walk(child, depth + 1));
      }
    };
    walk(tree, 0);
    return keys;
  }, [tree]);

  if (!passport || !tree) return null;

  const effectiveExpanded = expanded.size === 0 ? new Set(initialExpansion) : expanded;
  const sections: Array<[string, string[]]> = [
    ['Какими средствами собирается', passport.tools],
    ['Какие данные использует', passport.data],
    ['Откуда берутся данные', passport.sources],
    ['Как работает по шагам', passport.flow],
    ['Что делает пользователь', passport.interactions],
    ['Если данных нет или что-то не прошло проверку', passport.fallback],
    ['Как ведёт себя на разных экранах', passport.responsive],
    ['Что может менять историческая эпоха', passport.hvs]
  ];

  function toggle(key: string) {
    const next = new Set(effectiveExpanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  }

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

        <section className={styles.structurePanel}>
          <div className={styles.structureHead}>
            <h3>Состав блока</h3>
            <span>как Layers в Figma</span>
          </div>
          <div className={styles.tree}>
            <LayerTree
              node={tree}
              selectedId={selectedId}
              depth={0}
              expanded={effectiveExpanded}
              onToggle={toggle}
              onSelect={onSelectLayer}
            />
          </div>
        </section>

        <SettingsPanel selectedId={selectedId} tuning={tuning} onChange={onTuningChange} />

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
