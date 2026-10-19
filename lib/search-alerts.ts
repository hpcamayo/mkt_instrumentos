import { instrumentFilterGroups, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import {
  categoryOptions,
  sellerTypeOptions,
  type ListingFilters,
} from "@/lib/listings";
import type { Json } from "@/lib/supabase/database.types";

export type SearchAlertFrequency = "immediate" | "daily";
export type SearchAlertStatus = "active" | "paused";

export type SearchAlertFilters = {
  category?: string;
  // save-05: one value, or several (a search for Lima or Arequipa).
  location?: string | string[];
  condition?: string | string[];
  brand?: string;
  seller_type?: "individual" | "store" | "verified_store";
  instrument_type?: string;
  min_price?: number;
  max_price?: number;
  advanced?: Record<string, string | string[] | number | boolean>;
};

export type SavedSearchAlert = {
  id: string;
  name?: string | null;
  // save-05: from get_account_search_alerts.
  match_count?: number;
  last_match_at?: string | null;
  new_count?: number;
  search_filters: SearchAlertFilters;
  frequency: SearchAlertFrequency;
  status: SearchAlertStatus;
  active_since: string;
  created_at: string;
};

// Saved alerts are validated and matched in the database (Sprint 7). Since save-05 a search with several locations or
// conditions (F11) is saved too: one value stays a string, several become a list.
const oneOrMany = (values: string[]) => (values.length === 1 ? values[0] : values.length ? [...values] : undefined);

export function listingFiltersToSearchAlert(filters: ListingFilters): SearchAlertFilters {
  const normalized: SearchAlertFilters = {};
  if (filters.category) normalized.category = filters.category;
  const location = oneOrMany(filters.cities);
  if (location) normalized.location = location;
  const condition = oneOrMany(filters.conditions);
  if (condition) normalized.condition = condition;
  if (filters.brand?.trim()) normalized.brand = filters.brand.trim();
  if (filters.sellerType) normalized.seller_type = filters.sellerType;
  if (filters.instrumentType) normalized.instrument_type = filters.instrumentType;
  if (filters.minPrice !== undefined) normalized.min_price = filters.minPrice;
  if (filters.maxPrice !== undefined) normalized.max_price = filters.maxPrice;
  if (Object.keys(filters.advanced).length) normalized.advanced = filters.advanced;
  return normalized;
}

export function searchAlertPath(filters: SearchAlertFilters) {
  const params = new URLSearchParams();
  append(params, "category", filters.category);
  for (const value of asList(filters.location)) params.append("location", value);
  for (const value of asList(filters.condition)) params.append("condition", value);
  append(params, "brand", filters.brand);
  append(params, "seller_type", filters.seller_type);
  append(params, "instrument_type", filters.instrument_type);
  append(params, "min_price", filters.min_price);
  append(params, "max_price", filters.max_price);
  for (const [key, value] of Object.entries(filters.advanced ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
  }
  return params.size ? `/listados?${params.toString()}` : "/listados";
}

export function searchAlertSummary(filters: SearchAlertFilters) {
  const parts: string[] = [];
  pushLabel(parts, categoryOptions, filters.category);
  pushLabel(parts, instrumentFilterGroups, filters.instrument_type, "instrumentType");
  if (filters.brand) parts.push(`Marca: ${filters.brand}`);
  if (filters.location) parts.push(asList(filters.location).join(" o "));
  if (filters.condition) parts.push(asList(filters.condition).join(" o "));
  pushLabel(parts, sellerTypeOptions, filters.seller_type);
  if (filters.min_price !== undefined || filters.max_price !== undefined) {
    const low = filters.min_price === undefined ? "sin mínimo" : `S/ ${formatNumber(filters.min_price)}`;
    const high = filters.max_price === undefined ? "sin máximo" : `S/ ${formatNumber(filters.max_price)}`;
    parts.push(`${low}–${high}`);
  }
  const configs = advancedConfigs(filters.instrument_type);
  for (const [key, value] of Object.entries(filters.advanced ?? {})) {
    const config = configs.get(key);
    const values = (Array.isArray(value) ? value : [value]).map((item) => (
      config?.options?.find((option) => option.value === String(item))?.label ?? String(item)
    ));
    parts.push(`${config?.label ?? key}: ${values.join(", ")}`);
  }
  return parts.length ? parts.join(" · ") : "Todo el catálogo";
}

export function searchAlertFrequencyLabel(value: SearchAlertFrequency) {
  return value === "immediate" ? "Inmediata" : "Resumen diario";
}

// save-05: the alert's own name, or what it searches for.
export function searchAlertTitle(alert: Pick<SavedSearchAlert, "name" | "search_filters">) {
  return alert.name?.trim() || searchAlertSummary(alert.search_filters);
}

// "última coincidencia hace 2 días · 7 en total".
export function searchAlertActivity(alert: Pick<SavedSearchAlert, "match_count" | "last_match_at">, now = Date.now()) {
  const total = alert.match_count ?? 0;
  if (!total || !alert.last_match_at) return "Sin coincidencias todavía";
  return `Última coincidencia ${timeAgo(alert.last_match_at, now)} · ${total} en total`;
}

function timeAgo(value: string, now: number) {
  const minutes = Math.max(0, Math.round((now - Date.parse(value)) / 60000));
  if (minutes < 60) return minutes <= 1 ? "hace un momento" : `hace ${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "hace 1 hora" : `hace ${hours} horas`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "ayer" : `hace ${days} días`;
  const months = Math.round(days / 30);
  return months === 1 ? "hace 1 mes" : `hace ${months} meses`;
}

export function parseSavedSearchAlerts(value: unknown): SavedSearchAlert[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)
      || !isUuid(item.id)
      || (item.name !== undefined && item.name !== null && typeof item.name !== "string")
      || (item.match_count !== undefined && !Number.isSafeInteger(item.match_count))
      || (item.new_count !== undefined && !Number.isSafeInteger(item.new_count))
      || (item.last_match_at !== undefined && item.last_match_at !== null && !isDate(item.last_match_at))
      || (item.frequency !== "immediate" && item.frequency !== "daily")
      || (item.status !== "active" && item.status !== "paused")
      || !isDate(item.active_since)
      || !isDate(item.created_at)) return [];
    const filters = parseSearchAlertFilters(item.search_filters);
    return filters ? [{ ...item, search_filters: filters } as SavedSearchAlert] : [];
  });
}

export function searchAlertFiltersAsJson(filters: SearchAlertFilters): Json {
  return filters as Json;
}

export function parseSearchAlertFilters(value: unknown): SearchAlertFilters | null {
  if (!isRecord(value)) return null;
  const allowed = new Set(["category", "location", "condition", "brand", "seller_type", "instrument_type", "min_price", "max_price", "advanced"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  for (const key of ["category", "brand", "instrument_type"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return null;
  }
  for (const key of ["location", "condition"] as const) {
    const item = value[key];
    if (item !== undefined && typeof item !== "string" && !(Array.isArray(item) && item.length > 0 && item.length <= 20 && item.every((entry) => typeof entry === "string"))) return null;
  }
  if (value.seller_type !== undefined && !["individual", "store", "verified_store"].includes(String(value.seller_type))) return null;
  for (const key of ["min_price", "max_price"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0)) return null;
  }
  if (value.advanced !== undefined && !isRecord(value.advanced)) return null;
  return value as SearchAlertFilters;
}

function advancedConfigs(instrumentType?: string) {
  const result = new Map<string, InstrumentFilterConfig>();
  for (const group of instrumentFilterGroups) {
    if (instrumentType && group.instrumentType !== instrumentType) continue;
    for (const filter of group.filters) if (!result.has(filter.key)) result.set(filter.key, filter);
  }
  return result;
}

function asList(value: string | string[] | undefined) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function append(params: URLSearchParams, key: string, value: string | number | undefined) {
  if (value !== undefined && value !== "") params.set(key, String(value));
}

function pushLabel(
  parts: string[],
  options: readonly ({ label: string } & Record<string, unknown>)[],
  value?: string,
  valueKey = "value",
) {
  if (!value) return;
  parts.push(options.find((option) => option[valueKey] === value)?.label ?? value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
