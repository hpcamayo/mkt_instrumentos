import { instrumentFilterGroups, type InstrumentFilterConfig } from "@/lib/instrument-filters";
import {
  categoryOptions,
  conditionOptions,
  sellerTypeOptions,
  type ListingFilters,
} from "@/lib/listings";
import type { Json } from "@/lib/supabase/database.types";

export type SearchAlertFrequency = "immediate" | "daily";
export type SearchAlertStatus = "active" | "paused";

export type SearchAlertFilters = {
  category?: string;
  location?: string;
  condition?: string;
  brand?: string;
  seller_type?: "individual" | "store" | "verified_store";
  instrument_type?: string;
  min_price?: number;
  max_price?: number;
  advanced?: Record<string, string | string[] | number | boolean>;
};

export type SavedSearchAlert = {
  id: string;
  search_filters: SearchAlertFilters;
  frequency: SearchAlertFrequency;
  status: SearchAlertStatus;
  active_since: string;
  created_at: string;
};

export function listingFiltersToSearchAlert(filters: ListingFilters): SearchAlertFilters {
  const normalized: SearchAlertFilters = {};
  if (filters.category) normalized.category = filters.category;
  if (filters.city) normalized.location = filters.city;
  if (filters.condition) normalized.condition = filters.condition;
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
  append(params, "location", filters.location);
  append(params, "condition", filters.condition);
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
  if (filters.location) parts.push(filters.location);
  pushLabel(parts, conditionOptions.map((value) => ({ value, label: value })), filters.condition);
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

export function parseSavedSearchAlerts(value: unknown): SavedSearchAlert[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)
      || !isUuid(item.id)
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

function parseSearchAlertFilters(value: unknown): SearchAlertFilters | null {
  if (!isRecord(value)) return null;
  const allowed = new Set(["category", "location", "condition", "brand", "seller_type", "instrument_type", "min_price", "max_price", "advanced"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  for (const key of ["category", "location", "condition", "brand", "instrument_type"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string") return null;
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
