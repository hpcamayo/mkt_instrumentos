import "server-only";

// Publication from an import, server side (design §7.7). Reads use the owner's own session, so RLS decides which
// import and SKUs are theirs. Publishing re-reads each selected row's cells as they were staged, validates them with
// the publish form's rules (publication.ts) and then calls the service-role function, the same way the publish form
// calls complete_public_submission(); the database re-checks ownership, the SKU, the photos and the allowance.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_PRICE_PEN } from "@/lib/price";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { ImportMapping } from "./mapping";
import {
  PUBLISH_CHUNK_ROWS,
  PUBLISH_FIELD_KEYS,
  applyPublishFields,
  planPublication,
  type MissingField,
  type PublicationItem,
  type PublishFieldOverrides,
} from "./publication";
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
  // The same, by field, for "Completar datos" (review fix B5); photos are `photos_missing`.
  missing_fields: MissingField[];
  photos_missing: boolean;
  category: string | null;
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
  publish_fields: PublishFieldOverrides | null;
  applied_item_id: string | null;
  photo_state: string | null;
  photo_count: number;
  publish_status: string | null;
  publish_message: string | null;
  published_listing_id: string | null;
};

type ItemRow = PublicationItem & {
  id: string;
  version: number;
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
      .select("id,version,merchant_sku,product_name,variant_label,unit_price_pen,listing_id,inventory_status,quantity_available")
      .in("id", ids.slice(start, start + 150));
    if (error) throw importErrorFrom(error);
    for (const item of (data ?? []) as ItemRow[]) items.set(item.id, item);
  }
  return items;
}

type RowState = { state: PublishRowState; missing: string[]; missing_fields: MissingField[]; photos_missing: boolean; warnings: string[] };

function rowState(row: StagedRow, item: ItemRow | undefined, parsed: ParsedImportRow | null): RowState {
  const none = { missing: [], missing_fields: [], photos_missing: false, warnings: [] };
  if (row.publish_status === "published") return { state: "published", ...none };
  if (!item) return { state: "unavailable", ...none };
  if (item.listing_id) return { state: "linked", ...none };
  if (item.inventory_status !== "active") return { state: "unavailable", ...none };
  const plan = parsed ? planPublication(parsed, item) : { fields: null, missing: ["datos de la fila"], missingFields: [], warnings: [] };
  const missing = [...plan.missing];
  const photosMissing = row.photo_state !== "ready";
  if (photosMissing) missing.push(PHOTO_PROBLEMS[row.photo_state ?? "none"] ?? PHOTO_PROBLEMS.none);
  return {
    state: missing.length ? "incomplete" : "ready",
    missing,
    missing_fields: plan.missingFields,
    photos_missing: photosMissing,
    warnings: plan.warnings,
  };
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
      .select("row_number,parsed,publish_fields,applied_item_id,photo_state,photo_count,publish_status,publish_message,published_listing_id")
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
      const parsed = row.parsed ? applyPublishFields(row.parsed, row.publish_fields) : null;
      const { state, missing, missing_fields, photos_missing, warnings } = rowState(row, item, parsed);
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
        missing_fields,
        photos_missing,
        category: parsed?.category ?? null,
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
    .select("row_number,raw,publish_fields,applied_item_id,photo_state,photo_count,publish_status,publish_message,published_listing_id")
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
    // The staged cells, read again with the confirmed columns: the publication never trusts a stored parse. What the
    // owner completed on the result page goes over them, and the result is held to the same rules.
    const parsed = applyPublishFields(parseImportRow(row.raw ?? [], session.column_mapping ?? {}).parsed, row.publish_fields);
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

// ------------------------------------------------------------------ "Completar datos" (review fix B5)

export type PublishRowFields = {
  row_number: number;
  sku: string | null;
  name: string;
  // The row's publication values as they stand (the file's, with what the owner completed over them).
  values: Record<(typeof PUBLISH_FIELD_KEYS)[number], string>;
  price: number | null;
  item_version: number;
  missing_fields: MissingField[];
  photo_count: number;
  // none, too_few, too_many or blocked (the Fotos step's states); ready when the row has its photos.
  photo_state: string;
  photos_missing: boolean;
};

async function readStagedRow(db: Db, sessionId: string, rowNumber: number) {
  const { data, error } = await db
    .from("store_import_rows")
    .select("row_number,raw,publish_fields,applied_item_id,photo_state,photo_count,publish_status,publish_message,published_listing_id,commit_status")
    .eq("session_id", sessionId)
    .eq("row_number", rowNumber)
    .maybeSingle();
  if (error) throw importErrorFrom(error);
  const row = data as (StagedRow & { commit_status: string }) | null;
  if (!row || row.commit_status !== "applied" || !row.applied_item_id) {
    throw new ImportRequestError("IMPORT_ROW_NOT_FOUND", "Esa fila no se aplicó al inventario.", 404);
  }
  return row;
}

// One row's current values for the "Completar datos" form.
export async function readPublishRowFields(db: Db, sessionId: string, rowNumber: number): Promise<PublishRowFields> {
  const session = await readSession(db, sessionId);
  const row = await readStagedRow(db, sessionId, rowNumber);
  const item = (await readItems(db, [row.applied_item_id!])).get(row.applied_item_id!);
  if (!item) throw new ImportRequestError("IMPORT_ROW_NOT_FOUND", "El SKU de esta fila ya no está en tu inventario.", 404);
  const parsed = applyPublishFields(parseImportRow(row.raw ?? [], session.column_mapping ?? {}).parsed, row.publish_fields);
  const { missing_fields, photos_missing } = rowState(row, item, parsed);
  const values = Object.fromEntries(PUBLISH_FIELD_KEYS.map((key) => [key, typeof parsed[key] === "string" ? parsed[key] as string : ""]));
  return {
    row_number: row.row_number,
    sku: item.merchant_sku,
    name: item.product_name,
    values: values as PublishRowFields["values"],
    price: item.unit_price_pen ?? null,
    item_version: item.version,
    missing_fields,
    photo_count: row.photo_count,
    photo_state: row.photo_state ?? "none",
    photos_missing,
  };
}

export type PublishFieldsRequest = { row: number; fields: PublishFieldOverrides | null; price: number | null; itemVersion: number | null };

export function parsePublishFieldsRequest(body: unknown): PublishFieldsRequest | null {
  const input = body as { row?: unknown; fields?: unknown; price?: unknown; itemVersion?: unknown } | null;
  if (!input || typeof input !== "object" || !Number.isSafeInteger(input.row) || (input.row as number) < 1) return null;
  let fields: PublishFieldOverrides | null = null;
  if (input.fields !== undefined && input.fields !== null) {
    if (typeof input.fields !== "object" || Array.isArray(input.fields)) return null;
    const entries = Object.entries(input.fields as Record<string, unknown>);
    if (!entries.length || entries.some(([key, value]) => !(PUBLISH_FIELD_KEYS as readonly string[]).includes(key) || typeof value !== "string" || value.length > 4000)) return null;
    fields = Object.fromEntries(entries) as PublishFieldOverrides;
  }
  const price = input.price === undefined || input.price === null ? null : input.price;
  if (price !== null && (!Number.isSafeInteger(price) || (price as number) < 1 || (price as number) > MAX_PRICE_PEN)) return null;
  const itemVersion = input.itemVersion === undefined || input.itemVersion === null ? null : input.itemVersion;
  if (itemVersion !== null && !Number.isSafeInteger(itemVersion)) return null;
  if (price !== null && itemVersion === null) return null;
  if (!fields && price === null) return null;
  return { row: input.row as number, fields, price: price as number | null, itemVersion: itemVersion as number | null };
}

// Saves what the owner completed: the price goes to the SKU (the inventory's own price rules and history), the rest
// to the staged row. Both calls run as the owner, so the database checks the store, the import and the row again.
export async function savePublishRowFields(db: Db, sessionId: string, input: PublishFieldsRequest) {
  const session = await readSession(db, sessionId);
  const reason = closedReason(session.status, Boolean(session.rows_purged_at));
  if (reason) throw new ImportRequestError("IMPORT_PUBLISH_CLOSED", reason, 409);
  const row = await readStagedRow(db, sessionId, input.row);
  if (row.publish_status === "published") {
    throw new ImportRequestError("IMPORT_ROW_PUBLISHED", "Esta fila ya se publicó. Edita la publicación desde Inventario.", 409);
  }
  if (input.price !== null) {
    const { error } = await db.rpc("update_inventory_item", {
      p_item_id: row.applied_item_id,
      p_fields: { unit_price_pen: input.price },
      p_expected_version: input.itemVersion,
    });
    if (error) throw importErrorFrom(error);
  }
  if (input.fields) {
    const { error } = await db.rpc("set_store_import_row_publish_fields", {
      p_session_id: sessionId,
      p_row_number: input.row,
      p_fields: input.fields,
    });
    if (error) throw importErrorFrom(error);
  }
  return readPublishRowFields(db, sessionId, input.row);
}
