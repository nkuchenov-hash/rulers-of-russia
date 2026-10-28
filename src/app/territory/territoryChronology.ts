export type TerritoryPeriod = {
  start: number;
  end: number;
  startMonth?: number;
  endMonth?: number;
  polityId: string;
  label: string;
  shortLabel: string;
  era: string;
  focus: [number, number];
};

export const TERRITORY_MIN_YEAR = 862;
export const TERRITORY_MAX_YEAR = 2026;

// This is the canonical state track used by the ruler chronology UI.
// Geometry is NOT defined here: it comes from dated, source-backed local snapshots.
export const TERRITORY_PERIODS: TerritoryPeriod[] = [
  {
    start: 862,
    end: 881,
    polityId: 'novgorodian-land',
    label: 'Новгородская земля ранней Руси',
    shortLabel: 'Русь',
    era: 'Ранняя Русь',
    focus: [36, 59]
  },
  {
    start: 882,
    end: 1124,
    polityId: 'kievan-rus',
    label: 'Древнерусское государство',
    shortLabel: 'Древняя Русь',
    era: 'Древняя Русь',
    focus: [34, 52]
  },
  {
    start: 1125,
    end: 1262,
    polityId: 'grand-vladimir',
    label: 'Великое княжество Владимирское',
    shortLabel: 'Владимирская Русь',
    era: 'Удельная Русь',
    focus: [41, 57]
  },
  {
    start: 1263,
    end: 1546,
    polityId: 'grand-moscow',
    label: 'Великое княжество Московское',
    shortLabel: 'Москва',
    era: 'Собирание русских земель',
    focus: [42, 57]
  },
  {
    start: 1547,
    end: 1720,
    polityId: 'russian-tsardom',
    label: 'Русское царство',
    shortLabel: 'Русское царство',
    era: 'Русское царство',
    focus: [60, 58]
  },
  {
    start: 1721,
    end: 1916,
    polityId: 'russian-empire',
    label: 'Российская империя',
    shortLabel: 'Империя',
    era: 'Российская империя',
    focus: [72, 58]
  },
  {
    start: 1917,
    end: 1917,
    polityId: 'russian-republic',
    label: 'Россия в 1917 году',
    shortLabel: 'Россия, 1917',
    era: 'Революционный 1917 год',
    focus: [72, 58]
  },
  {
    start: 1918,
    end: 1922,
    endMonth: 11,
    polityId: 'rsfsr',
    label: 'Российская СФСР',
    shortLabel: 'РСФСР',
    era: 'Революция и гражданская война',
    focus: [72, 58]
  },
  {
    start: 1922,
    startMonth: 12,
    end: 1991,
    polityId: 'ussr',
    label: 'Союз Советских Социалистических Республик',
    shortLabel: 'СССР',
    era: 'Советский период',
    focus: [74, 57]
  },
  {
    start: 1992,
    end: TERRITORY_MAX_YEAR,
    polityId: 'russian-federation',
    label: 'Российская Федерация',
    shortLabel: 'Россия',
    era: 'Российская Федерация',
    focus: [88, 61]
  }
];

export const POLITY_TRANSITION_YEARS = TERRITORY_PERIODS.map((period) => period.start);

// History Core resolves the month-end state: January–November 1922 are RSFSR,
// while the USSR begins in December after the 30 December founding act.
// Keep the default month at December for legacy year-only callers.
export function territoryPeriodAt(year: number, month = 12) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid territory month: ${month}`);
  }
  const selected = year * 12 + month;
  return TERRITORY_PERIODS.find((period) =>
    selected >= period.start * 12 + (period.startMonth ?? 1)
    && selected <= period.end * 12 + (period.endMonth ?? 12)
  ) ?? TERRITORY_PERIODS[0];
}
