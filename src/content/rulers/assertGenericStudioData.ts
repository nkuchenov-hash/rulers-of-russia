import type { RulerPageData } from './pageModel';

export function assertGenericStudioData(data: RulerPageData): RulerPageData {
  const activeRailItem = data.rail.find((item) => item.active);
  const isGeneric =
    data.id === 'generic-ruler' &&
    data.slug === 'generic-ruler' &&
    data.visualStateKey === 'core' &&
    data.hero.displayName === 'ИМЯ ПРАВИТЕЛЯ' &&
    activeRailItem?.name === 'ТЕКУЩИЙ ПРАВИТЕЛЬ' &&
    data.sources.length === 0;

  if (!isGeneric) {
    throw new Error('Studio is generic-only. Historical ruler content is forbidden in /studio/.');
  }

  return data;
}
