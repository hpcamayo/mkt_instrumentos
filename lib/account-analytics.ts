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
    verified_transactions: number;
    contact_to_verified_rate: number | null;
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
  if (!["active", "sold", "store_views", "store_contacts", "verified_transactions"].every((key) => isCount(summary[key]))
    || !isRatio(summary.contact_to_verified_rate)) return null;

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

// ------------------------------------------------------------------ Listing statistics (mine-11, shop-07)

// get_listing_statistics accepts only these windows (anything else raises ANALYTICS_WINDOW_INVALID).
export type StatisticsWindow = 7 | 30 | 90;

export type ListingStatisticsRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  price_pen: number | null;
  published_at: string | null;
  views: number;
  impressions: number;
  // WhatsApp openings without purchase intent; purchase requests (PAY-1) are counted apart.
  contacts: number;
  purchase_requests: number;
  saves: number;
  favorites: number;
  photos: number;
  description_length: number;
};

export type WeeklyStatistics = { week_start: string; views: number; contacts: number; purchase_requests: number };

export type ListingStatistics = {
  days: StatisticsWindow;
  listings: ListingStatisticsRow[];
  weekly: WeeklyStatistics[];
  // Approved listings with WhatsApp openings (any intent) in the last 30 days: count of listings, their openings, top 5.
  contacts_without_sale: { count: number; contacts: number; items: { id: string; title: string; contacts: number }[] };
};

const LISTING_STATUSES = ["draft", "pending", "approved", "rejected", "hidden", "sold", "archived"];
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

export function parseStatisticsWindow(value: unknown, fallback: StatisticsWindow = 30): StatisticsWindow {
  if (value === "7" || value === 7) return 7;
  if (value === "30" || value === 30) return 30;
  if (value === "90" || value === 90) return 90;
  return fallback;
}

function isStatisticsRow(value: unknown): value is ListingStatisticsRow {
  return isObject(value) && typeof value.id === "string" && value.id.length > 0 && typeof value.title === "string"
    && (value.slug === null || typeof value.slug === "string") && LISTING_STATUSES.includes(value.status as string)
    && (value.price_pen === null || (typeof value.price_pen === "number" && Number.isFinite(value.price_pen) && value.price_pen >= 0))
    && isDate(value.published_at)
    && ["views", "impressions", "contacts", "purchase_requests", "saves", "favorites", "photos", "description_length"].every((key) => isCount(value[key]));
}

// Validates the get_listing_statistics payload; anything malformed is "unavailable", never a zero dashboard.
export function parseListingStatistics(value: unknown): ListingStatistics | null {
  if (!isObject(value) || ![7, 30, 90].includes(value.days as number) || !Array.isArray(value.listings) || !Array.isArray(value.weekly)) return null;
  const ids = new Set<string>();
  for (const listing of value.listings) {
    if (!isStatisticsRow(listing) || ids.has(listing.id)) return null;
    ids.add(listing.id);
  }
  for (const week of value.weekly) {
    if (!isObject(week) || typeof week.week_start !== "string" || !WEEK.test(week.week_start) || !Number.isFinite(Date.parse(week.week_start))
      || !["views", "contacts", "purchase_requests"].every((key) => isCount(week[key]))) return null;
  }
  const stale = value.contacts_without_sale;
  if (!isObject(stale) || !isCount(stale.count) || !isCount(stale.contacts) || !Array.isArray(stale.items)
    || !stale.items.every((item) => isObject(item) && typeof item.id === "string" && item.id.length > 0 && typeof item.title === "string" && isCount(item.contacts))) return null;
  return value as ListingStatistics;
}

// Request-scoped like getAccountAnalytics; the RPC scopes rows to the caller (no owner parameter).
export const getListingStatistics = cache(async function getListingStatistics(days: StatisticsWindow = 30): Promise<ListingStatistics | null> {
  const { profile, supabase } = await getAccountContext();
  if (!supabase || !["seller", "store_owner"].includes(profile?.account_type ?? "")) return null;
  try {
    const { data, error } = await supabase.rpc("get_listing_statistics", { p_days: days });
    if (error) return null;
    const statistics = parseListingStatistics(data);
    return statistics?.days === days ? statistics : null;
  } catch {
    return null;
  }
});

export function listingEditHref(id: string) {
  return `/mi-cuenta/publicaciones/${id}/editar`;
}

// Sold or archived listings cannot be edited, so they get no tips (the edit page would turn the owner away).
const EDITABLE = new Set(["draft", "pending", "approved", "rejected", "hidden"]);

// Plain next steps for one listing, most useful first, at most two. Period numbers drive the first ones; "few
// contacts" and "several contacts" count every WhatsApp opening, purchase requests included, since a purchase
// request is stronger interest than an ordinary contact.
export function listingTips(listing: Pick<ListingStatisticsRow, "status" | "views" | "contacts" | "purchase_requests" | "photos" | "description_length">): string[] {
  if (!EDITABLE.has(listing.status)) return [];
  const openings = listing.contacts + listing.purchase_requests;
  const tips: string[] = [];
  if (listing.status === "approved" && listing.views === 0) tips.push("Sin vistas en este periodo: mejora el título o la primera foto");
  if (listing.status === "approved" && listing.views >= 30 && openings / listing.views < 0.02) tips.push("Muchas vistas y pocos contactos: revisa el precio");
  if (listing.status === "approved" && openings >= 5) tips.push("Varios contactos sin venta: ¿sigue disponible?");
  if (listing.photos === 0) tips.push("Sin fotos: agrega el frente, el reverso y los detalles");
  else if (listing.photos <= 2) tips.push(`Solo ${listing.photos} ${listing.photos === 1 ? "foto" : "fotos"}: agrega el reverso y los detalles`);
  if (listing.description_length < 120) tips.push("Descripción breve: cuenta el estado real y qué incluye");
  return tips.slice(0, 2);
}

// Top rows by one period number, leaving out listings with none of it.
export function topListings(listings: ListingStatisticsRow[], key: "views" | "contacts" | "purchase_requests", limit = 5) {
  return listings.filter((listing) => listing[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, limit);
}
