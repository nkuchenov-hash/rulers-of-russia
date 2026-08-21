import type { RulerPageData, ThematicCardData } from './pageModel';

const forbiddenVisiblePlaceholderPatterns: RegExp[] = [
  /\bзначение\b/i,
  /ключевое событие\s*\d/i,
  /элемент\s*\d/i,
  /город\s*\/\s*регион/i,
  /текущий правитель/i,
  /одобренное изображение/i,
  /hero\.imageAssetId/i,
  /chronology\./i,
  /пока нет approved/i
];

function collectStrings(value: unknown, path = 'data'): Array<{ path: string; value: string }> {
  if (typeof value === 'string') return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => collectStrings(child, `${path}.${key}`));
  }
  return [];
}

function validateThematicCard(card: ThematicCardData, errors: string[]) {
  if (!card.title.trim()) errors.push(`thematic.${card.id}: нет title`);
  if (!card.actionLabel.trim()) errors.push(`thematic.${card.id}: нет actionLabel`);

  if (card.type === 'list' && (!card.items || card.items.length < 3)) {
    errors.push(`thematic.${card.id}: list должен содержать минимум 3 реальных пункта`);
  }
  if (card.type === 'diagram' && (!card.diagram || card.diagram.nodes.length < 3)) {
    errors.push(`thematic.${card.id}: diagram должен содержать centerLabel и минимум 3 узла`);
  }
  if ((card.type === 'image' || card.type === 'mixed') && !card.summary) {
    errors.push(`thematic.${card.id}: нужен содержательный summary`);
  }
}

export function assertCompleteRulerPageData(data: RulerPageData, fixtureName: string): RulerPageData {
  const errors: string[] = [];

  if (data.rail.length < 5) errors.push('rail: слишком мало контекстных правителей');
  if (data.rail.some((item) => !item.portraitLabel?.trim())) errors.push('rail: у каждого элемента нужен визуальный portraitLabel/fallback');
  if (data.hero.meta.length < 4) errors.push('hero.meta: нужно минимум 4 заполненных поля');
  if (data.hero.keyEvents.length < 4) errors.push('hero.keyEvents: нужно минимум 4 события');
  if (!data.hero.imageAssetId && !data.hero.imageFallbackLabel?.trim()) errors.push('hero: нужен approved imageAssetId или нормальный visual fallback без dev-текста');
  if (data.territory.legend.length < 3) errors.push('territory.legend: нужно минимум 3 состояния/типа территории');
  if (data.map.places.length < 4) errors.push('map.places: нужно минимум 4 содержательных географических метки');
  if (data.facts.length < 7) errors.push('facts: нужно минимум 7 заполненных фактов');
  if (data.thematic.length < 4) errors.push('thematic: нужно минимум 4 тематических карточки');
  data.thematic.forEach((card) => validateThematicCard(card, errors));
  if (data.timeline.events.length < 6) errors.push('timeline: нужно минимум 6 событий');
  if (data.sources.length < 3) errors.push('sources: конкретная историческая fixture должна иметь минимум 3 источника');

  const materialsTab = data.tabs.find((tab) => tab.id === 'materials');
  if (materialsTab?.enabled) {
    errors.push('tabs.materials: вкладка пока не должна быть включена без отдельного Materials dataset/module');
  }

  for (const entry of collectStrings(data)) {
    for (const pattern of forbiddenVisiblePlaceholderPatterns) {
      if (pattern.test(entry.value)) {
        errors.push(`${entry.path}: найден generic/dev placeholder «${entry.value}»`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`[${fixtureName}] concrete ruler fixture is incomplete:\n- ${errors.join('\n- ')}`);
  }

  return data;
}
