import type { RulerPageData } from './pageModel';
import { labRulerPageData } from './labRulerPageData';

/**
 * Studio-only neutral fixture for the ruler overview dashboard.
 *
 * Studio must stay generic: it demonstrates the reusable information
 * architecture without binding the Core system to one historical ruler.
 * The real page replaces these placeholders with sourced ruler-specific data.
 */
export const studioGenericPageData: RulerPageData = {
  ...labRulerPageData,
  tabs: [
    { id: 'overview', label: 'Обзор', enabled: true },
    { id: 'territory', label: 'Территория', enabled: true },
    { id: 'reforms', label: 'Реформы', enabled: true },
    { id: 'economy', label: 'Экономика', enabled: true },
    { id: 'wars-diplomacy', label: 'Войны и дипломатия', enabled: true },
    { id: 'culture', label: 'Культура', enabled: true },
    { id: 'personality', label: 'Личность', enabled: true }
  ],
  territory: {
    summary: 'Главный интерактивный срез правления: границы, войны, города, инфраструктура и другие пространственные изменения по времени.',
    legend: [
      { id: 'l1', label: 'Границы', type: 'base' },
      { id: 'l2', label: 'Войны и походы', type: 'gain' },
      { id: 'l3', label: 'Инфраструктура', type: 'end' },
      { id: 'l4', label: 'Города и центры', type: 'dependent' }
    ]
  },
  facts: [
    { id: 'f1', label: 'Население', value: 'значение → значение · Δ' },
    { id: 'f2', label: 'Территория', value: 'значение → значение · Δ' },
    { id: 'f3', label: 'Государственные доходы', value: 'значение → значение · Δ' },
    { id: 'f4', label: 'Производство / промышленность', value: 'значение → значение · Δ' },
    { id: 'f5', label: 'Транспорт / инфраструктура', value: 'значение → значение · Δ' },
    { id: 'f6', label: 'Армия', value: 'значение → значение · Δ' }
  ],
  thematic: Array.from({ length: 7 }, (_, index) => ({
    id: `event-${index + 1}`,
    type: 'image' as const,
    title: `СОБЫТИЕ / ЯВЛЕНИЕ ${index + 1}`,
    dateLabel: 'год / период',
    summary: 'Один из наиболее важных или интересных узлов этого правления. Короткий тезис вместо пересказа всей темы.',
    mediaLabel: 'Исторический визуальный материал события',
    actionLabel: 'Подробнее →'
  }))
};
