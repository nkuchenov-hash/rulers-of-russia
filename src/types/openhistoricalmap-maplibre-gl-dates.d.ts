declare module '@openhistoricalmap/maplibre-gl-dates' {
  import type { FilterSpecification, Map } from 'maplibre-gl';

  export type HistoricalDateRange = {
    startDate: Date | false;
    startDecimalYear: number | false;
    startISODate: string | false;
    endDate: Date | false;
    endDecimalYear: number | false;
    endISODate: string | false;
  };

  export function filterByDate(map: Map, date: string | Date): void;
  export function dateRangeFromISODate(date: string): HistoricalDateRange;
  export function constrainFilterByDateRange(
    filter: FilterSpecification | undefined,
    dateRange: HistoricalDateRange
  ): FilterSpecification;
}
