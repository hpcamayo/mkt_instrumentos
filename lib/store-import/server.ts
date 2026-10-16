import "server-only";

// The import step loop's server side (design §7.1). The open wizard page calls POST /api/store/imports/{id}/step
// repeatedly; each call takes the session lease, runs bounded units of work for at most STEP_BUDGET_MS, checkpoints,
// and releases the lease. Every database call uses the owner's own session, so auth.uid() decides ownership.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  IMPORT_COMMIT_CHUNK_ROWS,
  IMPORT_PLAN_CHUNK_ROWS,
  IMPORT_STAGE_CHUNK_ROWS,
} from "./limits";
import { IMPORT_NO_CATEGORY } from "./labels";
import { proposeMapping, type ImportMapping } from "./mapping";
import { parseImportRow } from "./rows";
import { readSpreadsheet } from "./sheet";
import { ImportFileError, type ImportCell, type SpreadsheetFormat } from "./types";

// Untyped on purpose: the import functions are not in the generated database types yet (the combined prototype
// regenerates them), and every value crossing this boundary is checked by the database anyway.
type Db = SupabaseClient;

export const STEP_BUDGET_MS = 20_000;
const STAGE_UNITS_PER_STEP = 2;

export type ImportSession = {
  id: string;
  store_id: string;
  status: string;
  file_format: SpreadsheetFormat;
  file_name: string;
  file_path: string;
  file_bytes: number;
  sheet_name: string | null;
  header_row: number | null;
  headers: string[] | null;
  proposed_mapping: ImportMapping | null;
  column_mapping: ImportMapping | null;
  row_count: number | null;
  parse_cursor: number;
  file_warnings: string[];
  counts: Record<string, number>;
  result_summary: Record<string, number> | null;
  photo_counts?: Record<string, number>;
  version: number;
  error_code: string | null;
  error_message: string | null;
  lease_active?: boolean;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
  closed_at: string | null;
};

export type StepNext = "upload" | "continue" | "mapping" | "review" | "done" | "failed" | "busy";

export type StepResult = { session: ImportSession | null; next: StepNext; message?: string };

export class ImportRequestError extends Error {
  constructor(public readonly code: string, public readonly userMessage: string, public readonly status = 409) {
    super(code);
  }
}

// Database errors arrive as "CODE: mensaje en español" (laria_private.raise_import_error / raise_inventory_error).
export function importErrorFrom(error: { message?: string; code?: string } | null): ImportRequestError {
  const match = /^([A-Z][A-Z_]{2,80}): ([\s\S]+)$/.exec(error?.message ?? "");
  if (match) {
    const status = match[1] === "IMPORT_SESSION_NOT_FOUND" ? 404 : match[1] === "INVENTORY_STORE_REQUIRED" ? 403 : 409;
    return new ImportRequestError(match[1], match[2].slice(0, 300), status);
  }
  if (error?.code === "42501") return new ImportRequestError("IMPORT_FORBIDDEN", "No tienes acceso a esta importación.", 403);
  return new ImportRequestError("IMPORT_UNAVAILABLE", "No pudimos continuar la importación. Intenta de nuevo.", 503);
}

async function call<T>(db: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw importErrorFrom(error);
  return data as T;
}

export async function readImportSession(db: Db, sessionId: string): Promise<ImportSession | null> {
  const { data, error } = await db.from("store_import_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (error) throw importErrorFrom(error);
  if (!data) return null;
  const { lock_token: _token, created_by: _creator, ...session } = data as Record<string, unknown>;
  void _token;
  void _creator;
  return { ...(session as unknown as ImportSession), lease_active: Boolean(data.locked_until && new Date(data.locked_until) > new Date()) };
}

export function nextFor(session: ImportSession | null): StepNext {
  switch (session?.status) {
    case "awaiting_upload": return "upload";
    case "parsing":
    case "validating":
    case "committing": return "continue";
    case "mapping_required": return "mapping";
    case "ready": return "review";
    case "failed": return "failed";
    default: return "done";
  }
}

export async function createImportSession(db: Db, input: { fileName: string; format: SpreadsheetFormat; bytes: number }) {
  return call<{ session: ImportSession; upload: { bucket: string; path: string } }>(db, "create_store_import_session", {
    p_file_name: input.fileName,
    p_file_format: input.format,
    p_file_bytes: input.bytes,
  });
}

export async function runImportStep(db: Db, sessionId: string): Promise<StepResult> {
  let claim: { lock_token: string; session: ImportSession };
  try {
    claim = await call(db, "claim_store_import_step", { p_session_id: sessionId });
  } catch (error) {
    if (error instanceof ImportRequestError && error.code === "IMPORT_BUSY") {
      return { session: await readImportSession(db, sessionId), next: "busy", message: error.userMessage };
    }
    if (error instanceof ImportRequestError && error.code === "IMPORT_SESSION_CLOSED") {
      const session = await readImportSession(db, sessionId);
      return { session, next: nextFor(session) };
    }
    throw error;
  }
  const token = claim.lock_token;
  const session = claim.session;
  const started = Date.now();
  try {
    if (session.status === "awaiting_upload" || session.status === "parsing") {
      await parseStep(db, session, token);
    } else if (session.status === "validating") {
      await planStep(db, session, token, started);
    } else if (session.status === "committing") {
      await commitStep(db, session, token, started);
    }
  } finally {
    // A closed session has no lease left; releasing is a no-op then.
    await db.rpc("release_store_import_step", { p_session_id: sessionId, p_lock_token: token });
  }
  const current = await readImportSession(db, sessionId);
  return { session: current, next: nextFor(current) };
}

async function parseStep(db: Db, session: ImportSession, token: string) {
  const { data: blob, error } = await db.storage.from("store-imports").download(session.file_path);
  if (error || !blob) {
    if (session.status === "awaiting_upload") return; // the browser has not finished uploading yet
    throw new ImportRequestError("IMPORT_FILE_MISSING", "No encontramos el archivo subido. Empieza otra importación.", 409);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await call(db, "begin_store_import_parse", { p_session_id: session.id, p_lock_token: token, p_file_sha256: sha256, p_file_bytes: bytes.length });

  let sheet: ReturnType<typeof readSpreadsheet>;
  try {
    sheet = readSpreadsheet(bytes, session.file_format);
  } catch (failure) {
    if (failure instanceof ImportFileError) {
      await call(db, "fail_store_import", { p_session_id: session.id, p_lock_token: token, p_code: failure.code, p_message: failure.userMessage });
      return;
    }
    await call(db, "fail_store_import", {
      p_session_id: session.id, p_lock_token: token, p_code: "IMPORT_FILE_INVALID",
      p_message: "No pudimos leer el archivo. Guárdalo otra vez como .xlsx o .csv.",
    });
    return;
  }

  const pending = sheet.rows.filter((row) => row.rowNumber > session.parse_cursor);
  for (let unit = 0; unit < STAGE_UNITS_PER_STEP && pending.length; unit += 1) {
    const chunk = pending.splice(0, IMPORT_STAGE_CHUNK_ROWS);
    await call(db, "stage_store_import_rows", {
      p_session_id: session.id,
      p_lock_token: token,
      p_rows: chunk.map((row) => ({ row_number: row.rowNumber, raw: compactCells(row.cells) })),
    });
  }
  if (pending.length) return; // the next step stages the rest

  const { data: settings } = await db.from("store_operation_settings").select("import_mapping_default").eq("store_id", session.store_id).maybeSingle();
  const saved = (settings?.import_mapping_default ?? null) as Record<string, string> | null;
  await call(db, "finish_store_import_parse", {
    p_session_id: session.id,
    p_lock_token: token,
    p_meta: {
      headers: sheet.headers,
      header_row: sheet.headerRow,
      sheet_name: sheet.sheetName,
      row_count: sheet.rows.length,
      proposed_mapping: proposeMapping(sheet.headers, saved),
      warnings: sheet.warnings.slice(0, 20),
    },
  });
}

// Trailing empty cells are dropped to keep staged rows small; positions are kept by index.
function compactCells(cells: ImportCell[]) {
  let end = cells.length;
  while (end > 0 && !cells[end - 1].v) end -= 1;
  return cells.slice(0, end).map((cell) => (cell.v ? cell : { v: "" }));
}

async function planStep(db: Db, session: ImportSession, token: string, started: number) {
  const mapping = session.column_mapping ?? {};
  while (Date.now() - started < STEP_BUDGET_MS) {
    const { data: rows, error } = await db
      .from("store_import_rows")
      .select("row_number,raw")
      .eq("session_id", session.id)
      .is("planned_action", null)
      .order("row_number", { ascending: true })
      .limit(IMPORT_PLAN_CHUNK_ROWS);
    if (error) throw importErrorFrom(error);
    if (!rows?.length) {
      await call(db, "finish_store_import_validation", { p_session_id: session.id, p_lock_token: token });
      return;
    }
    await call(db, "plan_store_import_rows", {
      p_session_id: session.id,
      p_lock_token: token,
      p_rows: rows.map((row) => {
        const { parsed, issues } = parseImportRow((row.raw ?? []) as ImportCell[], mapping);
        return { row_number: row.row_number, parsed, issues };
      }),
    });
  }
}

async function commitStep(db: Db, session: ImportSession, token: string, started: number) {
  while (Date.now() - started < STEP_BUDGET_MS) {
    const { data: rows, error } = await db
      .from("store_import_rows")
      .select("row_number")
      .eq("session_id", session.id)
      .eq("commit_status", "pending")
      .eq("owner_decision", "include")
      .in("planned_action", ["create", "update", "adopt_listing"])
      .order("row_number", { ascending: true })
      .limit(IMPORT_COMMIT_CHUNK_ROWS);
    if (error) throw importErrorFrom(error);
    if (!rows?.length) {
      await call(db, "finish_store_import_commit", { p_session_id: session.id, p_lock_token: token });
      return;
    }
    const rowNumbers = rows.map((row) => row.row_number);
    const { error: chunkError } = await db.rpc("commit_store_import_chunk", {
      p_session_id: session.id, p_lock_token: token, p_row_numbers: rowNumbers,
    });
    if (chunkError) {
      // A SKU was linked while the chunk waited for its locks: nothing was applied, the next step retries it.
      if (chunkError.code === "40001" || chunkError.code === "40P01") return;
      throw importErrorFrom(chunkError);
    }
  }
}

export type ImportAction =
  | { action: "mapping"; mapping: ImportMapping; version: number; saveDefault?: boolean }
  | { action: "decision"; rows: number[] | null; decision: "include" | "exclude"; version: number }
  | { action: "confirm"; version: number }
  | { action: "reopen"; version: number }
  | { action: "cancel" };

export function parseImportAction(body: unknown): ImportAction | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const version = Number(input.version);
  const hasVersion = Number.isSafeInteger(version) && version > 0;
  switch (input.action) {
    case "mapping": {
      const mapping = input.mapping;
      if (!hasVersion || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) return null;
      const clean: ImportMapping = {};
      for (const [key, value] of Object.entries(mapping as Record<string, unknown>)) {
        if (typeof value !== "number" || !Number.isInteger(value)) return null;
        clean[key] = value;
      }
      return { action: "mapping", mapping: clean, version, saveDefault: input.saveDefault === true };
    }
    case "decision": {
      const rows = input.rows === null ? null : Array.isArray(input.rows) && input.rows.length <= 2000
        && input.rows.every((row) => Number.isSafeInteger(row)) ? (input.rows as number[]) : undefined;
      if (!hasVersion || rows === undefined || (input.decision !== "include" && input.decision !== "exclude")) return null;
      return { action: "decision", rows, decision: input.decision, version };
    }
    case "confirm":
    case "reopen":
      return hasVersion ? { action: input.action, version } : null;
    case "cancel":
      return { action: "cancel" };
    default:
      return null;
  }
}

export async function applyImportAction(db: Db, sessionId: string, action: ImportAction) {
  switch (action.action) {
    case "mapping":
      await call(db, "confirm_store_import_mapping", {
        p_session_id: sessionId, p_mapping: action.mapping, p_expected_version: action.version,
        p_save_as_default: action.saveDefault ?? false,
      });
      break;
    case "decision":
      await call(db, "set_store_import_rows_decision", {
        p_session_id: sessionId, p_row_numbers: action.rows, p_decision: action.decision, p_expected_version: action.version,
      });
      break;
    case "confirm":
      await call(db, "start_store_import_commit", { p_session_id: sessionId, p_expected_version: action.version });
      break;
    case "reopen":
      await call(db, "reopen_store_import", { p_session_id: sessionId, p_expected_version: action.version });
      break;
    case "cancel":
      await call(db, "cancel_store_import", { p_session_id: sessionId });
      break;
  }
  const session = await readImportSession(db, sessionId);
  return { session, next: nextFor(session) };
}

export const ROW_FILTERS = ["all", "create", "update", "adopt_listing", "unchanged", "error", "warning", "excluded", "conflict", "failed", "applied"] as const;
export type RowFilter = (typeof ROW_FILTERS)[number];

// One page of staged rows for the review table, keyset-paginated by row number. `category` is a category value from
// the file (as parsed) or IMPORT_NO_CATEGORY (empty or not recognized).
export async function readImportRows(db: Db, sessionId: string, filter: RowFilter, after: number, limit: number, category: string | null = null) {
  let query = db
    .from("store_import_rows")
    .select("row_number,parsed,issues,sku_normalized,planned_action,changes,owner_decision,commit_status,commit_message")
    .eq("session_id", sessionId)
    .gt("row_number", after)
    .order("row_number", { ascending: true })
    .limit(limit);
  if (category === IMPORT_NO_CATEGORY) query = query.is("parsed->>category", null);
  else if (category) query = query.eq("parsed->>category", category);
  if (filter === "create" || filter === "update" || filter === "adopt_listing") {
    query = query.eq("planned_action", filter).eq("owner_decision", "include");
  } else if (filter === "unchanged" || filter === "error") {
    query = query.eq("planned_action", filter);
  } else if (filter === "excluded") {
    query = query.eq("owner_decision", "exclude").in("planned_action", ["create", "update", "adopt_listing"]);
  } else if (filter === "conflict" || filter === "failed" || filter === "applied") {
    query = query.eq("commit_status", filter);
  } else if (filter === "warning") {
    query = query.neq("planned_action", "error").contains("issues", [{ severity: "warning" }]);
  }
  const { data, error } = await query;
  if (error) throw importErrorFrom(error);
  return data ?? [];
}

// How many staged rows each category of the file has, for the category chips of the review (review fix B3). Read in
// pages of 1,000 (the API's page size); an import has at most 2,000 rows.
export async function readImportCategoryCounts(db: Db, sessionId: string) {
  const counts: Record<string, number> = {};
  for (let from = 0; from < 3000; from += 1000) {
    const { data, error } = await db
      .from("store_import_rows")
      .select("category:parsed->>category")
      .eq("session_id", sessionId)
      .order("row_number", { ascending: true })
      .range(from, from + 999);
    if (error) throw importErrorFrom(error);
    const rows = (data ?? []) as unknown as { category: string | null }[];
    for (const row of rows) {
      const key = row.category || IMPORT_NO_CATEGORY;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    if (rows.length < 1000) break;
  }
  return counts;
}

// The first rows as read from the file, so the column step can show an example value under each heading.
export async function readImportSample(db: Db, sessionId: string, limit = 3) {
  const { data, error } = await db
    .from("store_import_rows")
    .select("row_number,raw")
    .eq("session_id", sessionId)
    .order("row_number", { ascending: true })
    .limit(limit);
  if (error) throw importErrorFrom(error);
  return (data ?? []).map((row) => ({ row_number: row.row_number as number, raw: (row.raw ?? []) as ImportCell[] }));
}
