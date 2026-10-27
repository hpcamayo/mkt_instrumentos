import { foldText } from "@/lib/catalog-query";

// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-04 "Distribuidor oficial". Pure helpers
// shared by the owner's page, Admin and the public marks; the database decides who is a dealer
// (supabase/migrations/20261205140000_feat_store_reach_dealers.sql).

export const DEALER_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type DealerDocumentType = (typeof DEALER_DOCUMENT_TYPES)[number];
export const DEALER_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export type DealerStatus = "awaiting_document" | "pending" | "approved" | "rejected" | "revoked" | "withdrawn";

export type DealerAuthorization = {
  id: string;
  brand: string;
  status: DealerStatus;
  active: boolean;
  documentName: string;
  documentType: DealerDocumentType;
  documentBytes: number;
  validUntil: string | null;
  ownerNote: string | null;
  createdAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  revision: number;
  // Admin's list only.
  store?: { id: string; name: string; slug: string; status: string; ruc: string | null; verified: boolean };
};

// One authorization in force, as the public reads it (get_active_dealer_authorizations).
export type ActiveDealer = {
  brand: string;
  validUntil: string | null;
  storeId: string;
  storeSlug: string;
  storeName: string;
  storeCity: string | null;
  storeVerified: boolean;
  keys: string[];
};

const STATUSES: DealerStatus[] = ["awaiting_document", "pending", "approved", "rejected", "revoked", "withdrawn"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const DEALER_STATUS_LABELS: Record<DealerStatus, string> = {
  awaiting_document: "Falta subir el documento",
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "No aprobada",
  revoked: "Retirada por Laria",
  withdrawn: "Retirada por tu tienda",
};

// The folded brand, as the database keys it (catalog_fold with single spaces).
export function dealerBrandKey(value: string | null | undefined) {
  return foldText(value ?? "").replace(/[“”„″«»]/g, '"').replace(/\s+/g, " ").trim();
}

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseDealerAuthorization(value: unknown): DealerAuthorization | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const status = STATUSES.find((item) => item === row.status);
  const documentType = DEALER_DOCUMENT_TYPES.find((item) => item === row.document_type);
  if (typeof row.id !== "string" || typeof row.brand !== "string" || !status || !documentType || typeof row.revision !== "number") return null;
  const validUntil = text(row.valid_until);
  return {
    id: row.id,
    brand: row.brand,
    status,
    active: row.active === true,
    documentName: text(row.document_name) ?? "documento",
    documentType,
    documentBytes: typeof row.document_bytes === "number" ? row.document_bytes : 0,
    validUntil: validUntil && DATE.test(validUntil) ? validUntil : null,
    ownerNote: text(row.owner_note),
    createdAt: text(row.created_at) ?? "",
    submittedAt: text(row.submitted_at),
    reviewedAt: text(row.reviewed_at),
    reviewReason: text(row.review_reason),
    revision: row.revision,
    store: typeof row.store_id === "string" ? {
      id: row.store_id,
      name: text(row.store_name) ?? "",
      slug: text(row.store_slug) ?? "",
      status: text(row.store_status) ?? "",
      ruc: text(row.store_ruc),
      verified: row.store_verified === true,
    } : undefined,
  };
}

export function parseDealerAuthorizations(value: unknown): DealerAuthorization[] {
  return Array.isArray(value) ? value.map(parseDealerAuthorization).filter((row): row is DealerAuthorization => row !== null) : [];
}

export function parseActiveDealers(value: unknown): ActiveDealer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.brand !== "string" || typeof row.store_id !== "string" || typeof row.store_slug !== "string" || typeof row.store_name !== "string") return [];
    const keys = Array.isArray(row.keys) ? row.keys.filter((key): key is string => typeof key === "string" && key.length > 0) : [];
    const validUntil = text(row.valid_until);
    return [{
      brand: row.brand,
      validUntil: validUntil && DATE.test(validUntil) ? validUntil : null,
      storeId: row.store_id,
      storeSlug: row.store_slug,
      storeName: row.store_name,
      storeCity: text(row.store_city),
      storeVerified: row.store_verified === true,
      keys: keys.length ? keys : [dealerBrandKey(row.brand)],
    }];
  });
}

// The mark a publication shows: a new instrument of an active dealer's store, of the dealer's brand.
export function dealerForListing(
  dealers: ActiveDealer[],
  listing: { store_id?: string | null; brand?: string | null; condition?: string | null; seller_type?: string | null },
) {
  if (!listing.store_id || listing.seller_type === "individual" || !listing.brand?.trim()) return null;
  if (!(listing.condition ?? "").toLowerCase().startsWith("nuevo")) return null;
  const key = dealerBrandKey(listing.brand);
  return dealers.find((dealer) => dealer.storeId === listing.store_id && dealer.keys.includes(key)) ?? null;
}

// The dealers of the brand the catalog is filtered by.
export function dealersForBrand(dealers: ActiveDealer[], brand: string | null | undefined) {
  const key = dealerBrandKey(brand);
  if (!key) return [];
  return dealers.filter((dealer) => dealer.keys.includes(key)).sort((a, b) => a.storeName.localeCompare(b.storeName, "es"));
}

export function storeDealerBrands(dealers: ActiveDealer[], storeId: string) {
  return [...new Set(dealers.filter((dealer) => dealer.storeId === storeId).map((dealer) => dealer.brand))].sort((a, b) => a.localeCompare(b, "es"));
}

// What the bytes are, from their first bytes (never from the name or the browser's word): a PDF, JPEG, PNG or WebP.
export function detectDealerDocumentType(bytes: Uint8Array): DealerDocumentType | null {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (bytes.length >= 8 && starts(0x25, 0x50, 0x44, 0x46, 0x2d)) {
    // %PDF- ... and an end-of-file marker near the end.
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 1024))).toString("latin1");
    return tail.includes("%%EOF") ? "application/pdf" : null;
  }
  if (bytes.length >= 4 && starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (bytes.length >= 8 && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (bytes.length >= 12 && starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  return null;
}

export function formatDealerDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}
