import { cache } from "react";
import { getAccountContext } from "@/lib/account-context";

export type AnalyticsWindow = 0 | 7 | 30;

type ListingMetrics = {
  views: number;
  recorded_views: number;
  impressions: number;
  contacts: number;
  favorites: number;
  favorite_additions: number;
  favorite_removals: number;
  favorite_rate: number | null;
  ctr: number | null;
  contact_rate: number | null;
};

export type ListingAnalytics = ListingMetrics & {
  id: string;
  title: string;
  status: string;
  published_at: string | null;
  sold_at: string | null;
};

export type AccountAnalytics = {
  days: AnalyticsWindow;
  tracking_started_at: string | null;
  summary: ListingMetrics & {
    active: number;
    sold: number;
    store_views: number;
    store_contacts: number;
  };
  listings: ListingAnalytics[];
};

export function parseAnalyticsWindow(value: unknown, fallback: AnalyticsWindow = 30): AnalyticsWindow {
  if (value === "0" || value === 0) return 0;
  if (value === "7" || value === 7) return 7;
  if (value === "30" || value === 30) return 30;
  return fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRatio(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isDate(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value)));
}

function hasMetrics(value: Record<string, unknown>) {
  return ["views", "recorded_views", "impressions", "contacts", "favorites", "favorite_additions", "favorite_removals"].every((key) => isCount(value[key]))
    && isRatio(value.ctr) && isRatio(value.contact_rate) && isRatio(value.favorite_rate);
}

export function parseAccountAnalytics(value: unknown): AccountAnalytics | null {
  if (!isObject(value) || ![0, 7, 30].includes(value.days as number) || !isDate(value.tracking_started_at)
    || !isObject(value.summary) || !hasMetrics(value.summary)
    || !Array.isArray(value.listings)) return null;
  const summary = value.summary;
  if (!["active", "sold", "store_views", "store_contacts"].every((key) => isCount(summary[key]))) return null;

  const ids = new Set<string>();
  for (const listing of value.listings) {
    if (!isObject(listing) || typeof listing.id !== "string" || !listing.id || ids.has(listing.id)
      || typeof listing.title !== "string" || !["draft", "pending", "approved", "rejected", "hidden", "sold", "archived"].includes(listing.status as string)
      || !isDate(listing.published_at) || !isDate(listing.sold_at) || !hasMetrics(listing)) return null;
    ids.add(listing.id);
  }
  return value as AccountAnalytics;
}

// Request-scoped caching deduplicates private aggregates without sharing them across users.
export const getAccountAnalytics = cache(async function getAccountAnalytics(days: AnalyticsWindow = 0): Promise<AccountAnalytics | null> {
  const { profile, supabase } = await getAccountContext();
  if (!supabase || !["seller", "store_owner"].includes(profile?.account_type ?? "")) return null;
  try {
    const { data, error } = await supabase.rpc("get_account_analytics", { p_days: days });
    if (error) return null;
    const analytics = parseAccountAnalytics(data);
    return analytics?.days === days ? analytics : null;
  } catch {
    return null;
  }
});
