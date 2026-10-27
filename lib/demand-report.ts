import { searchAlertPath, searchAlertSummary, type SearchAlertFilters } from "@/lib/search-alerts";

// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-06 "Lo que buscan en Laria": the
// monthly demand report a store reads at /mi-cuenta/tienda/demanda. The database builds it once a month
// (laria_private.build_demand_report) and get_demand_report() returns it to the owner of an active store or an Admin.
// The report is counts, never advice (Henri's note on reach-06): the page shows what each figure counts, its period
// and the floor of 5 people, and it never ranks a row as a recommendation.

export const DEMAND_SECTIONS = ["brand", "query", "type", "no_results", "alert"] as const;
export type DemandSection = (typeof DEMAND_SECTIONS)[number];

export type DemandRowFilters = Pick<SearchAlertFilters, "category" | "instrument_type" | "brand" | "query">;

export type DemandRow = {
  section: DemandSection;
  position: number;
  // null: every search of that kind, whatever its city.
  city: string | null;
  filters: DemandRowFilters;
  people: number;
  listed: number;
  // The caller store's live publications that the row's search finds; null for an Admin.
  mine: number | null;
};

export type DemandReport = {
  month: string;
  periodStart: string;
  periodEnd: string;
  builtAt: string;
  threshold: number;
  // Totals under the threshold come back as null and read "menos de 5".
  searchers: number | null;
  searchersWithCity: number | null;
  searchersInLima: number | null;
  alertHolders: number | null;
  rows: DemandRow[];
};

export type DemandReportResult = { months: string[]; report: DemandReport | null };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])-01$/;

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function text(value: unknown, max = 120): string | undefined {
  return typeof value === "string" && value.trim() && value.length <= max ? value : undefined;
}

function parseFilters(value: unknown): DemandRowFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const filters: DemandRowFilters = {};
  const query = text(record.query, 60);
  const category = text(record.category, 40);
  const instrumentType = text(record.instrument_type, 80);
  const brand = text(record.brand, 80);
  if (query) filters.query = query;
  if (category) filters.category = category;
  if (instrumentType) filters.instrument_type = instrumentType;
  if (brand) filters.brand = brand;
  return Object.keys(filters).length ? filters : null;
}

function parseRow(value: unknown): DemandRow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const section = DEMAND_SECTIONS.find((item) => item === record.section);
  const filters = parseFilters(record.filters);
  const people = count(record.people);
  const listed = count(record.listed);
  const position = count(record.position);
  if (!section || !filters || people === null || listed === null || position === null) return null;
  return {
    section,
    position,
    city: text(record.city, 100) ?? null,
    filters,
    people,
    listed,
    mine: count(record.mine),
  };
}

export function parseDemandReport(value: unknown): DemandReportResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const months = Array.isArray(record.months) ? record.months.filter((month): month is string => typeof month === "string" && MONTH.test(month)) : [];
  const raw = record.report as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw !== "object") return { months, report: null };
  const month = typeof raw.month === "string" && MONTH.test(raw.month) ? raw.month : null;
  const threshold = count(raw.threshold);
  if (!month || threshold === null || typeof raw.period_start !== "string" || typeof raw.period_end !== "string") return null;
  return {
    months,
    report: {
      month,
      periodStart: raw.period_start,
      periodEnd: raw.period_end,
      builtAt: typeof raw.built_at === "string" ? raw.built_at : raw.period_end,
      threshold,
      searchers: count(raw.searchers),
      searchersWithCity: count(raw.searchers_with_city),
      searchersInLima: count(raw.searchers_in_lima),
      alertHolders: count(raw.alert_holders),
      rows: Array.isArray(raw.rows) ? raw.rows.map(parseRow).filter((row): row is DemandRow => row !== null) : [],
    },
  };
}

// "2026-09" from the page's ?mes=; anything else means the latest report.
export function parseDemandMonth(value: string | undefined): string | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : null;
}

// ------------------------------------------------------------------ presentation

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "septiembre de 2026" from "2026-09-01".
export function demandMonthLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  return `${MONTHS[value - 1]} de ${year}`;
}

export function demandMonthChipLabel(month: string) {
  const label = demandMonthLabel(month).replace(" de ", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// "del 1 al 30 de septiembre de 2026": the period is always one whole Lima month.
export function demandPeriodLabel(month: string) {
  const [year, value] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return `del 1 al ${last} de ${demandMonthLabel(month)}`;
}

const numbers = new Intl.NumberFormat("es-PE");

export function demandCount(value: number | null, threshold: number) {
  return value === null ? `menos de ${threshold}` : numbers.format(value);
}

// The cities a month has rows for, most people first, for the city chips.
export function demandCities(rows: DemandRow[]) {
  const people = new Map<string, number>();
  for (const row of rows) if (row.city) people.set(row.city, (people.get(row.city) ?? 0) + row.people);
  return [...people.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([city]) => city);
}

export function demandRowsFor(rows: DemandRow[], section: DemandSection, city: string | null) {
  return rows.filter((row) => row.section === section && row.city === city).sort((a, b) => b.people - a.people || a.position - b.position);
}

// The row's search in words ("Marca: Yamaha · Teclados") and the catalog search it describes, in the row's city.
export function demandRowLabel(row: Pick<DemandRow, "section" | "filters">) {
  if (row.section === "brand" && row.filters.brand) return row.filters.brand;
  // A type named like its category ("Bajos · Bajos") is said once.
  const parts = searchAlertSummary(row.filters).split(" · ");
  return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(" · ");
}

export function demandRowPath(row: Pick<DemandRow, "filters" | "city">) {
  return searchAlertPath(row.city ? { ...row.filters, location: row.city } : row.filters);
}

export function demandPagePath({ month, city }: { month?: string | null; city?: string | null }) {
  const params = new URLSearchParams();
  if (month) params.set("mes", month.slice(0, 7));
  if (city) params.set("ciudad", city);
  return params.size ? `/mi-cuenta/tienda/demanda?${params.toString()}` : "/mi-cuenta/tienda/demanda";
}
