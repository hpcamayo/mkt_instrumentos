import { categoryOptions } from "@/lib/listings";
import { IMPORT_NO_CATEGORY } from "@/lib/store-import/labels";
import { readImportCategoryCounts, readImportRows, readImportSample, ROW_FILTERS, type RowFilter } from "@/lib/store-import/server";
import { importClient, importErrorResponse, importJson, isImportSessionId } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// A page of staged rows for the review table: ?filter=create|update|…&category=<category value or "none">&after=<row
// number>&limit=50. With ?sample=1, the first three rows as read from the file (for the column step); with
// ?categories=1, how many rows each category has (for the category chips).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isImportSessionId(id)) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
  const auth = await importClient(request, false);
  if ("response" in auth) return auth.response;
  const search = new URL(request.url).searchParams;
  if (search.get("sample") === "1") {
    try {
      return importJson({ rows: await readImportSample(auth.db, id) });
    } catch (error) {
      return importErrorResponse(error);
    }
  }
  if (search.get("categories") === "1") {
    try {
      return importJson({ categories: await readImportCategoryCounts(auth.db, id) });
    } catch (error) {
      return importErrorResponse(error);
    }
  }
  const requested = search.get("category") ?? "";
  const category = requested === IMPORT_NO_CATEGORY || categoryOptions.some((option) => option.value === requested) ? requested : null;
  const filter = (ROW_FILTERS as readonly string[]).includes(search.get("filter") ?? "") ? (search.get("filter") as RowFilter) : "all";
  const after = Math.max(0, Math.min(Number.parseInt(search.get("after") ?? "0", 10) || 0, 10_000_000));
  const limit = Math.max(1, Math.min(Number.parseInt(search.get("limit") ?? "50", 10) || 50, 100));
  try {
    const rows = await readImportRows(auth.db, id, filter, after, limit + 1, category);
    const page = rows.slice(0, limit);
    return importJson({ rows: page, nextAfter: rows.length > limit ? page[page.length - 1]?.row_number ?? null : null });
  } catch (error) {
    return importErrorResponse(error);
  }
}
