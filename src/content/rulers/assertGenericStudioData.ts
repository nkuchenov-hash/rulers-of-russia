import type { RulerPageData } from './pageModel';

export function assertGenericStudioData(data: RulerPageData): RulerPageData {
  if (data.id !== 'generic-ruler' || data.slug !== 'generic-ruler') {
    throw new Error('Studio must use generic ruler data only. Concrete historical ruler data is forbidden in /studio/.');
  }

  return data;
}
