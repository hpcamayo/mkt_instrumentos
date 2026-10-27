// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-05 "Campañas Laria". Pure helpers for
// the store's, Admin's and the public pages; the database checks every price
// (supabase/migrations/20261205150000_feat_store_reach_campaigns.sql). Dates are plain dates in Lima time: campaign
// pages never count down.

export type CampaignStatus = "draft" | "published" | "cancelled";
export type CampaignPhase = "draft" | "cancelled" | "upcoming" | "live" | "ended";
export type CampaignEntryStatus = "scheduled" | "live" | "ended" | "withdrawn" | "ineligible" | "removed";
export type AfterCampaign = "restore" | "keep";

export type Campaign = {
  id: string;
  slug: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  minDiscountPct: number;
  status: CampaignStatus;
  phase: CampaignPhase;
  revision: number;
};

export type CampaignEntry = {
  id: string;
  campaignId: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  campaignPrice: number;
  referencePrice: number;
  priceBefore: number;
  afterCampaign: AfterCampaign;
  status: CampaignEntryStatus;
  statusReason: string | null;
  appliedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  // Admin's view only.
  storeName?: string;
  storeSlug?: string;
};

export type CampaignListingOption = {
  id: string;
  title: string;
  slug: string;
  price: number | null;
  referencePrice: number | null;
  maxCampaignPrice: number | null;
  eligibleFrom: string | null;
  problemCode: string | null;
  problem: string | null;
  entry: CampaignEntry | null;
};

export type StoreCampaign = Campaign & { entries: CampaignEntry[] };
export type CampaignOptions = Campaign & { listings: CampaignListingOption[] };
export type AdminCampaignSummary = Campaign & { entryCount: number; liveCount: number; scheduledCount: number };
export type AdminCampaign = Campaign & { entries: CampaignEntry[] };
export type PublicCampaignSummary = Campaign & { liveCount: number };
export type PublicCampaignEntry = { listingId: string; campaignPrice: number; referencePrice: number; appliedAt: string };
export type PublicCampaign = Campaign & { total: number; entries: PublicCampaignEntry[] };
export type LiveCampaignMark = { listingId: string; slug: string; name: string; endsAt: string; campaignPrice: number; referencePrice: number };

export const CAMPAIGN_PAGE_SIZE = 24;
export const CAMPAIGN_MAX_DAYS = 30;
export const CAMPAIGN_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const STATUSES: CampaignStatus[] = ["draft", "published", "cancelled"];
const PHASES: CampaignPhase[] = ["draft", "cancelled", "upcoming", "live", "ended"];
const ENTRY_STATUSES: CampaignEntryStatus[] = ["scheduled", "live", "ended", "withdrawn", "ineligible", "removed"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LIMA = "America/Lima";

export const CAMPAIGN_PHASE_LABELS: Record<CampaignPhase, string> = {
  draft: "Borrador",
  cancelled: "Cancelada",
  upcoming: "Próxima",
  live: "En curso",
  ended: "Terminada",
};

export const CAMPAIGN_ENTRY_STATUS_LABELS: Record<CampaignEntryStatus, string> = {
  scheduled: "Inscrita",
  live: "En la campaña",
  ended: "Terminó",
  withdrawn: "Salió de la campaña",
  ineligible: "No entró",
  removed: "Retirada por Laria",
};

export const AFTER_CAMPAIGN_LABELS: Record<AfterCampaign, string> = {
  restore: "Volver al precio anterior",
  keep: "Mantener el precio de campaña",
};

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseCampaign(value: unknown): Campaign | null {
  const row = record(value);
  if (!row) return null;
  const status = STATUSES.find((item) => item === row.status);
  const phase = PHASES.find((item) => item === row.phase);
  const startsAt = text(row.starts_at);
  const endsAt = text(row.ends_at);
  const minDiscountPct = integer(row.min_discount_pct);
  const revision = integer(row.revision);
  if (typeof row.id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string" || !status || !phase
    || !startsAt || !endsAt || minDiscountPct === null || revision === null) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: text(row.description) ?? "",
    startsAt,
    endsAt,
    minDiscountPct,
    status,
    phase,
    revision,
  };
}

export function parseCampaignEntry(value: unknown): CampaignEntry | null {
  const row = record(value);
  if (!row) return null;
  const status = ENTRY_STATUSES.find((item) => item === row.status);
  const afterCampaign = row.after_campaign === "restore" || row.after_campaign === "keep" ? row.after_campaign : null;
  const campaignPrice = integer(row.campaign_price_pen);
  const referencePrice = integer(row.reference_price_pen);
  const priceBefore = integer(row.price_before_pen);
  if (typeof row.id !== "string" || typeof row.campaign_id !== "string" || typeof row.listing_id !== "string" || !status || !afterCampaign
    || campaignPrice === null || referencePrice === null || priceBefore === null) return null;
  return {
    id: row.id,
    campaignId: row.campaign_id,
    listingId: row.listing_id,
    listingTitle: text(row.listing_title) ?? "Publicación",
    listingSlug: text(row.listing_slug) ?? "",
    campaignPrice,
    referencePrice,
    priceBefore,
    afterCampaign,
    status,
    statusReason: text(row.status_reason),
    appliedAt: text(row.applied_at),
    endedAt: text(row.ended_at),
    createdAt: text(row.created_at) ?? "",
    storeName: text(row.store_name) ?? undefined,
    storeSlug: text(row.store_slug) ?? undefined,
  };
}

function entries(value: unknown) {
  return Array.isArray(value) ? value.map(parseCampaignEntry).filter((entry): entry is CampaignEntry => entry !== null) : [];
}

export function parseStoreCampaigns(value: unknown): StoreCampaign[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const campaign = parseCampaign(item);
    return campaign ? [{ ...campaign, entries: entries(record(item)?.entries) }] : [];
  });
}

export function parseCampaignOptions(value: unknown): CampaignOptions | null {
  const campaign = parseCampaign(value);
  const row = record(value);
  if (!campaign || !row) return null;
  const listings = Array.isArray(row.listings) ? row.listings.flatMap((item) => {
    const option = record(item);
    if (!option || typeof option.id !== "string" || typeof option.title !== "string") return [];
    const eligibleFrom = text(option.eligible_from);
    return [{
      id: option.id,
      title: option.title,
      slug: text(option.slug) ?? "",
      price: integer(option.price_pen),
      referencePrice: integer(option.reference_price_pen),
      maxCampaignPrice: integer(option.max_campaign_price_pen),
      eligibleFrom: eligibleFrom && DATE.test(eligibleFrom) ? eligibleFrom : null,
      problemCode: text(option.problem_code),
      problem: text(option.problem),
      entry: parseCampaignEntry(option.entry),
    }];
  }) : [];
  return { ...campaign, listings };
}

export function parseAdminCampaigns(value: unknown): AdminCampaignSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const campaign = parseCampaign(item);
    const row = record(item);
    if (!campaign || !row) return [];
    return [{ ...campaign, entryCount: integer(row.entries) ?? 0, liveCount: integer(row.live_entries) ?? 0, scheduledCount: integer(row.scheduled_entries) ?? 0 }];
  });
}

export function parseAdminCampaign(value: unknown): AdminCampaign | null {
  const campaign = parseCampaign(value);
  return campaign ? { ...campaign, entries: entries(record(value)?.entries) } : null;
}

export function parsePublicCampaigns(value: unknown): PublicCampaignSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const campaign = parseCampaign(item);
    return campaign ? [{ ...campaign, liveCount: integer(record(item)?.live_entries) ?? 0 }] : [];
  });
}

export function parsePublicCampaign(value: unknown): PublicCampaign | null {
  const campaign = parseCampaign(value);
  const row = record(value);
  if (!campaign || !row) return null;
  const list = Array.isArray(row.entries) ? row.entries.flatMap((item) => {
    const entry = record(item);
    const campaignPrice = integer(entry?.campaign_price_pen);
    const referencePrice = integer(entry?.reference_price_pen);
    if (!entry || typeof entry.listing_id !== "string" || campaignPrice === null || referencePrice === null || typeof entry.applied_at !== "string") return [];
    return [{ listingId: entry.listing_id, campaignPrice, referencePrice, appliedAt: entry.applied_at }];
  }) : [];
  return { ...campaign, total: integer(row.total) ?? list.length, entries: list };
}

export function parseLiveCampaignMarks(value: unknown): LiveCampaignMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = record(item);
    const campaignPrice = integer(row?.campaign_price_pen);
    const referencePrice = integer(row?.reference_price_pen);
    if (!row || typeof row.listing_id !== "string" || typeof row.slug !== "string" || typeof row.name !== "string"
      || typeof row.ends_at !== "string" || campaignPrice === null || referencePrice === null) return [];
    return [{ listingId: row.listing_id, slug: row.slug, name: row.name, endsAt: row.ends_at, campaignPrice, referencePrice }];
  });
}

// The line a publication's page shows: only while the campaign runs and the price is still the campaign price (the
// list behind it is shared for ten minutes, so a store's own change since then hides the line at once).
export function campaignMarkForListing(marks: LiveCampaignMark[], listing: { id: string; price_pen: number | null; status?: string | null }, now = Date.now()) {
  if (listing.status && listing.status !== "approved") return null;
  const mark = marks.find((item) => item.listingId === listing.id);
  if (!mark || mark.campaignPrice !== listing.price_pen || Date.parse(mark.endsAt) <= now) return null;
  return mark;
}

// The discount shown, rounded down so Laria never states more than the real one.
export function campaignDiscountPct(referencePrice: number, campaignPrice: number) {
  if (!(referencePrice > 0) || !(campaignPrice > 0) || campaignPrice >= referencePrice) return 0;
  return Math.floor(((referencePrice - campaignPrice) / referencePrice) * 100);
}

const dateFormat = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", timeZone: LIMA });
const dateTimeFormat = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LIMA });

export function formatCampaignDate(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : dateFormat.format(new Date(time));
}

export function formatCampaignDateTime(value: string) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "" : dateTimeFormat.format(new Date(time));
}

// "Del 20 de diciembre de 2026 al 2 de enero de 2027": the period as dates, never as a countdown. The year is said once
// when both days share it.
export function campaignPeriodLabel(campaign: Pick<Campaign, "startsAt" | "endsAt">) {
  const start = formatCampaignDate(campaign.startsAt);
  const end = formatCampaignDate(lastMoment(campaign.endsAt));
  const year = / de \d{4}$/.exec(end)?.[0];
  return `Del ${year && start.endsWith(year) ? start.slice(0, -year.length) : start} al ${end}`;
}

// A campaign that ends at 00:00 of a day was last open the day before.
function lastMoment(endsAt: string) {
  const time = Date.parse(endsAt);
  return Number.isNaN(time) ? endsAt : new Date(time - 1).toISOString();
}

export function campaignPhaseLine(campaign: Pick<Campaign, "phase" | "startsAt" | "endsAt">) {
  switch (campaign.phase) {
    case "upcoming": return `Empieza el ${formatCampaignDate(campaign.startsAt)}`;
    case "live": return `Hasta el ${formatCampaignDate(lastMoment(campaign.endsAt))}`;
    case "ended": return `Terminó el ${formatCampaignDate(lastMoment(campaign.endsAt))}`;
    default: return CAMPAIGN_PHASE_LABELS[campaign.phase];
  }
}

export function campaignPagePath(slug: string) {
  return `/campanas/${slug}`;
}

// The cards of a campaign page: the listing's own card, with the reference Laria checked as its "Antes" and the start
// of the campaign as the drop (a campaign lasts at most 30 days, so the card shows it the whole time).
export function campaignCards<T extends { id: string; price_pen: number | null; previous_price_pen?: number | null; price_dropped_at?: string | null }>(
  entries: PublicCampaignEntry[],
  listings: T[],
): T[] {
  return entries.flatMap((entry) => {
    const listing = listings.find((item) => item.id === entry.listingId);
    if (!listing || listing.price_pen !== entry.campaignPrice) return [];
    return [{ ...listing, previous_price_pen: entry.referencePrice, price_dropped_at: entry.appliedAt }];
  });
}

// Admin types Lima time in a datetime-local field; Peru keeps UTC-5 all year.
export function limaLocalToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}:00-05:00`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

export function isoToLimaLocal(value: string) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  return new Date(time - 5 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
