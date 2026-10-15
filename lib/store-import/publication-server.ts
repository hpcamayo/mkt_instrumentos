import "server-only";

// Publication from an import, server side (design §7.7). Reads use the owner's own session, so RLS decides which
// import and SKUs are theirs. Publishing re-reads each selected row's cells as they were staged, validates them with
// the publish form's rules (publication.ts) and then calls the service-role function, the same way the publish form
// calls complete_public_submission(); the database re-checks ownership, the SKU, the photos and the allowance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { ImportMapping } from "./mapping";
import { PUBLISH_CHUNK_ROWS, planPublication, type PublicationItem } from "./publication";
import { parseImportRow, type ParsedImportRow } from "./rows";
import { ImportRequestError, importErrorFrom } from "./server";
import type { ImportCell } from "./types";

type Db = SupabaseClient;

export type ListingQuota = { store_id: string; allowance: number; used: number; remaining: number; is_default: boolean };

export type PublishRowState = "ready" | "incomplete" | "published" | "linked" | "unavailable";

export type PublishRow = {
  row_number: number;
  sku: string | null;
  name: string;
  item_id: string;
  available: number;
  price: number | null;
  photo_count: number;
  state: PublishRowState;
  missing: string[];
  warnings: string[];
  // The last attempt's outcome when it did not publish ("failed" or "no_quota") and why.
  last_attempt: { status: string; message: string | null } | null;
  listing: { id: string; status: string; slug: string } | null;
};

export type PublishView = {
  open: boolean;
  closed_reason: string | null;
  quota: ListingQuota;
  store: { status: string; is_verified: boolean };
  counts: Record<string, number>;
  rows: PublishRow[];
};

export type PublishOutcome = {
  row_number: number;
  outcome: "published" | "already_published" | "failed" | "no_quota" | "incomplete" | "not_found";
  message?: string;
  listing_id?: string;
  listing_status?: string;
};

type StagedRow = {
  row_number: number;
  parsed: ParsedImportRow | null;
  raw?: ImportCell[];
  applied_item_id: string | null;
  photo_state: string | null;
  photo_count: number;
  publish_status: string | null;
  publish_message: string | null;
  published_listing_id: string | null;
};

type ItemRow = PublicationItem & {
  id: string;
  merchant_sku: string;
  listing_id: string | null;
  inventory_status: string;
  quantity_available: number;
};

const PHOTO_PROBLEMS: Record<string, string> = {
  none: "fotos (de 2 a 10)",
  too_few: "1 foto más",
  too_many: "dejar 10 fotos como máximo",
  blocked: "revisar el orden de las fotos",
};

async function readSession(db: Db, sessionId: string) {
  const { data, error } = await db
    .from("store_import_sessions")
    .select("id,store_id,status,column_mapping,publish_counts,rows_purged_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw importErrorFrom(error);
  if (!data) throw new ImportRequestError("IMPORT_SESSION_NOT_FOUND", "No encontramos esta importación.", 404);
  return data as { id: string; store_id: string; status: string; column_mapping: ImportMapping | null; publish_counts: Record<string, number> | null; rows_purged_at: string | null };
}

async function readItems(db: Db, ids: string[]) {
  const items = new Map<string, ItemRow>();
  for (let start = 0; start < ids.length; start += 150) {
    const { data, error } = await db
      .from("store_inventory_items")
      .select("id,merchant_sku,product_name,variant_label,unit_price_pen,listing_id,inventory_status,quantity_available")
      .in("id", ids.slice(start, start + 150));
    if (error) throw importErrorFrom(error);
    for (const item of (data ?? []) as ItemRow[]) items.set(item.id, item);
  }
  return items;
}

function rowState(row: StagedRow, item: ItemRow | undefined, parsed: ParsedImportRow | null) {
  if (row.publish_status === "published") return { state: "published" as const, missing: [], warnings: [] };
  if (!item) return { state: "unavailable" as const, missing: [], warnings: [] };
  if (item.listing_id) return { state: "linked" as const, missing: [], warnings: [] };
  if (item.inventory_status !== "active") return { state: "unavailable" as const, missing: [], warnings: [] };
  const plan = parsed ? planPublication(parsed, item) : { fields: null, missing: ["datos de la fila"], warnings: [] };
  const missing = [...plan.missing];
  if (row.photo_state !== "ready") missing.push(PHOTO_PROBLEMS[row.photo_state ?? "none"] ?? PHOTO_PROBLEMS.none);
  return { state: missing.length ? "incomplete" as const : "ready" as const, missing, warnings: plan.warnings };
}

function closedReason(status: string, purged: boolean) {
  if (purged) return "Pasaron 30 días desde esta importación. Publica desde Inventario.";
  if (status === "committed" || status === "partially_committed") return null;
  return "Primero confirma la importación; luego podrás publicar.";
}

// The publication step: every applied row (≤ 2,000) with what it still needs, plus the store's allowance.
export async function readPublishView(db: Db, sessionId: string): Promise<PublishView> {
  const session = await readSession(db, sessionId);
  const { data: quota, error: quotaError } = await db.rpc("get_store_listing_quota", {});
  if (quotaError) throw importErrorFrom(quotaError);
  const { data: store } = await db.from("stores").select("status,is_verified").eq("id", session.store_id).maybeSingle();

  const rows: StagedRow[] = [];
  for (let from = 0; from < 3000; from += 1000) {
    const page = await db
      .from("store_import_rows")
      .select("row_number,parsed,applied_item_id,photo_state,photo_count,publish_status,publish_message,published_listing_id")
      .eq("session_id", sessionId)
      .eq("commit_status", "applied")
      .order("row_number", { ascending: true })
      .range(from, from + 999);
    if (page.error) throw importErrorFrom(page.error);
    rows.push(...((page.data ?? []) as StagedRow[]));
    if ((page.data ?? []).length < 1000) break;
  }

  const items = await readItems(db, [...new Set(rows.map((row) => row.applied_item_id).filter((id): id is string => Boolean(id)))]);
  const listingIds = rows.map((row) => row.published_listing_id).filter((id): id is string => Boolean(id));
  const listings = new Map<string, { id: string; status: string; slug: string }>();
  for (let start = 0; start < listingIds.length; start += 150) {
    const { data } = await db.from("listings").select("id,status,slug").in("id", listingIds.slice(start, start + 150));
    for (const listing of (data ?? []) as { id: string; status: string; slug: string }[]) listings.set(listing.id, listing);
  }

  return {
    open: closedReason(session.status, Boolean(session.rows_purged_at)) === null,
    closed_reason: closedReason(session.status, Boolean(session.rows_purged_at)),
    quota: quota as ListingQuota,
    store: { status: store?.status ?? "pending", is_verified: store?.is_verified === true },
    counts: session.publish_counts ?? {},
    rows: rows.map((row) => {
      const item = row.applied_item_id ? items.get(row.applied_item_id) : undefined;
      const { state, missing, warnings } = rowState(row, item, row.parsed);
      return {
        row_number: row.row_number,
        sku: item?.merchant_sku ?? row.parsed?.sku ?? null,
        name: item?.product_name ?? row.parsed?.product_name ?? "",
        item_id: row.applied_item_id ?? "",
        available: item?.quantity_available ?? 0,
        price: item?.unit_price_pen ?? null,
        photo_count: row.photo_count,
        state,
        missing,
        warnings,
        last_attempt: row.publish_status && row.publish_status !== "published"
          ? { status: row.publish_status, message: row.publish_message } : null,
        listing: row.published_listing_id ? listings.get(row.published_listing_id) ?? null : null,
      };
    }),
  };
}

export function parsePublishRequest(body: unknown): { rows: number[]; rulesAccepted: boolean } | null {
  const input = body as { rows?: unknown; rulesAccepted?: unknown } | null;
  if (!input || !Array.isArray(input.rows)) return null;
  const rows = [...new Set(input.rows)];
  if (!rows.length || rows.length > PUBLISH_CHUNK_ROWS || !rows.every((row) => Number.isSafeInteger(row) && (row as number) > 0)) return null;
  return { rows: (rows as number[]).sort((a, b) => a - b), rulesAccepted: input.rulesAccepted === true };
}

// Publishes up to 20 rows. Rows that are not complete by the publish form's rules are reported and never sent.
export async function publishImportRows(db: Db, ownerUserId: string, sessionId: string, rowNumbers: number[], rulesAccepted: boolean) {
  if (!rulesAccepted) throw new ImportRequestError("IMPORT_PUBLISH_RULES_REQUIRED", "Debes aceptar las reglas del marketplace.", 400);
  const admin = getSupabaseAdminClient() as unknown as Db | null;
  if (!admin) throw new ImportRequestError("IMPORT_UNAVAILABLE", "No pudimos publicar. Intenta de nuevo.", 503);
  const session = await readSession(db, sessionId);
  const reason = closedReason(session.status, Boolean(session.rows_purged_at));
  if (reason) throw new ImportRequestError("IMPORT_PUBLISH_CLOSED", reason, 409);

  const { data, error } = await db
    .from("store_import_rows")
    .select("row_number,raw,applied_item_id,photo_state,photo_count,publish_status,publish_message,published_listing_id")
    .eq("session_id", sessionId)
    .in("row_number", rowNumbers);
  if (error) throw importErrorFrom(error);
  const staged = new Map(((data ?? []) as StagedRow[]).map((row) => [row.row_number, row]));
  const items = await readItems(db, [...new Set([...staged.values()].map((row) => row.applied_item_id).filter((id): id is string => Boolean(id)))]);

  const outcomes: PublishOutcome[] = [];
  const send: { row_number: number; fields: unknown }[] = [];
  for (const rowNumber of rowNumbers) {
    const row = staged.get(rowNumber);
    if (!row) {
      outcomes.push({ row_number: rowNumber, outcome: "not_found", message: "Esa fila no está en esta importación." });
      continue;
    }
    const item = row.applied_item_id ? items.get(row.applied_item_id) : undefined;
    // The staged cells, read again with the confirmed columns: the publication never trusts a stored parse.
    const parsed = parseImportRow(row.raw ?? [], session.column_mapping ?? {}).parsed;
    const plan = item && !item.listing_id && row.publish_status !== "published" ? planPublication(parsed, item) : null;
    if (plan && !plan.fields) {
      outcomes.push({ row_number: rowNumber, outcome: "incomplete", message: `Para publicar falta: ${plan.missing.join(", ")}.` });
      continue;
    }
    // Everything else (already published, linked, archived, photos, allowance) is the database's call.
    send.push({ row_number: rowNumber, fields: plan?.fields ?? {} });
  }

  let quota: ListingQuota | null = null;
  let counts: Record<string, number> = session.publish_counts ?? {};
  if (send.length) {
    const args = { p_owner_user_id: ownerUserId, p_session_id: sessionId, p_rows: send, p_rules_accepted: true };
    let result = await admin.rpc("publish_store_import_rows", args);
    // A SKU was linked by another request while this one waited: nothing was applied; try once more.
    if (result.error?.code === "40001" || result.error?.code === "40P01") result = await admin.rpc("publish_store_import_rows", args);
    if (result.error) throw importErrorFrom(result.error);
    const body = result.data as { results: PublishOutcome[]; publish_counts: Record<string, number>; quota: ListingQuota };
    outcomes.push(...body.results);
    quota = body.quota;
    counts = body.publish_counts;
  }
  outcomes.sort((a, b) => a.row_number - b.row_number);
  return { outcomes, quota, counts };
}
