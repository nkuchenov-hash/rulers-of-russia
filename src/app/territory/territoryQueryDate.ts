// Deep links must not silently clamp an impossible historical date to a
// different state. The default applies only when the year is absent.
export type ParsedTerritoryQueryDate =
  | {valid: true; year: number; month: number | null}
  | {valid: false; error: string};

function boundedInteger(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function parseTerritoryQueryDate(
  search: string, minYear: number, maxYear: number,
): ParsedTerritoryQueryDate {
  const params = new URLSearchParams(search);
  const years = params.getAll('year');
  const months = params.getAll('month');
  if (years.length > 1 || (years.length === 1 && boundedInteger(years[0], minYear, maxYear) === null)) {
    return {valid: false, error: 'Год должен быть целым числом от ' + minYear + ' до ' + maxYear + '.'};
  }
  if (months.length > 1 || (months.length === 1 && boundedInteger(months[0], 1, 12) === null)) {
    return {valid: false, error: 'Месяц должен быть целым числом от 1 до 12.'};
  }
  return {
    valid: true,
    year: years.length ? boundedInteger(years[0], minYear, maxYear)! : maxYear,
    month: months.length ? boundedInteger(months[0], 1, 12) : null,
  };
}
