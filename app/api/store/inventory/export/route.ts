import { NextResponse } from "next/server";
import { exportFilename, exportHeaders, exportRows, listingColumns, toCsv, toXlsxSheet, type ExportItem } from "@/lib/inventory-export";
import { INVENTORY_BULK_LIMIT } from "@/lib/inventory-actions";
import { writeXlsx } from "@/lib/spreadsheet/xlsx-write";
import { UUID, inventoryDb } from "@/lib/store-inventory";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// GET /api/store/inventory/export?format=csv|xlsx[&ids=…|&vista=…][&publicacion=1] (design §7.8). Reads the caller's
// own store through RLS, explicitly filtered by that store so an Admin session (which RLS lets read every store) still
// exports only a store it owns. Archived SKU are included only when selected by id or by an "Archivados" view.
// Effortless Laria, inventory batch: vista= is the screen's filters (stock-16 "Exportar esta vista", up to the bulk
// limit, in the screen's order); publicacion=1 adds the publication's own fields; ids= takes up to the bulk limit.

const PAGE = 1000;
const MAX_ROWS = 10000;

// Any failed lookup stops the export: a file with blank columns would look complete (Codex review 3, finding 7).
function exportFailed(step: string, error: { code?: string; message?: string }) {
  console.error("inventory export failed", step, error.code, error.message);
  return NextResponse.json({ message: "No se pudo preparar la exportación." }, { status: 500 });
}

// vista= is base64url JSON of the screen's filters (filtersForRpc), checked again by the database. null: none given.
function viewFilters(value: string | null): Record<string, string> | null | false {
  if (!value) return null;
  if (value.length > 800) return false;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const allowed = new Set(["q", "stock", "publication", "category", "sort", "price"]);
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (!entries.every(([key, entry]) => allowed.has(key) && typeof entry === "string" && entry.length <= 120)) return false;
    return Object.fromEntries(entries) as Record<string, string>;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : url.searchParams.get("format") === "csv" ? "csv" : null;
  if (!format) return NextResponse.json({ message: "Formato no compatible." }, { status: 400 });
  const idsParam = url.searchParams.get("ids");
  let ids = idsParam ? idsParam.split(",").filter(Boolean) : null;
  if (ids && (ids.length > INVENTORY_BULK_LIMIT || !ids.every((id) => UUID.test(id)))) {
    return NextResponse.json({ message: "Selección inválida." }, { status: 400 });
  }
  const view = viewFilters(url.searchParams.get("vista"));
  if (view === false) return NextResponse.json({ message: "Vista inválida." }, { status: 400 });
  const withListing = url.searchParams.get("publicacion") === "1";

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ message: "No se pudo validar tu cuenta." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ message: "Ingresa a tu cuenta." }, { status: 401 });
  const { data: store, error: storeError } = await supabase.from("stores").select("id,slug").eq("owner_user_id", userData.user.id).maybeSingle();
  if (storeError) return exportFailed("store", storeError);
  if (!store) return NextResponse.json({ message: "Necesitas una tienda para exportar inventario." }, { status: 404 });

  const db = inventoryDb(supabase);
  if (view) {
    const { data, error } = await db.rpc("get_inventory_item_ids", { p_filters: view });
    if (error) return exportFailed("view", error);
    ids = ((data as { ids?: string[] } | null)?.ids ?? []);
  }
  const items: (Omit<ExportItem, "listing"> & { id: string; listing_id: string | null })[] = [];
  if (ids) {
    // Chunks keep each request URL short; the view's own order is kept below.
    for (let start = 0; start < ids.length; start += 200) {
      const { data, error } = await db
        .from("store_inventory_items")
        .select("id,merchant_sku,product_name,variant_label,quantity_on_hand,quantity_available,unit_price_pen,low_stock_threshold,external_reference,inventory_status,listing_id")
        .eq("store_id", store.id)
        .in("id", ids.slice(start, start + 200));
      if (error) return exportFailed("items", error);
      items.push(...((data ?? []) as typeof items));
    }
    const order = new Map(ids.map((id, index) => [id, index]));
    items.sort((a, b) => (view ? (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0) : a.merchant_sku.toUpperCase().localeCompare(b.merchant_sku.toUpperCase())));
  }
  for (let from = 0; !ids && from < MAX_ROWS; from += PAGE) {
    let query = db
      .from("store_inventory_items")
      .select("id,merchant_sku,product_name,variant_label,quantity_on_hand,quantity_available,unit_price_pen,low_stock_threshold,external_reference,inventory_status,listing_id")
      .eq("store_id", store.id)
      .order("sku_normalized", { ascending: true })
      .range(from, from + PAGE - 1);
    query = query.eq("inventory_status", "active");
    const { data, error } = await query;
    if (error) return exportFailed("items", error);
    items.push(...((data ?? []) as typeof items));
    if (!data || data.length < PAGE) break;
  }

  const listingIds = [...new Set(items.map((item) => item.listing_id).filter((id): id is string => Boolean(id)))];
  const listings = new Map<string, NonNullable<ExportItem["listing"]>>();
  for (let start = 0; start < listingIds.length; start += 200) {
    const { data, error } = await supabase
      .from("listings")
      .select(withListing ? "id,slug,status,brand,model,category,title,price_pen,condition,city,description" : "id,slug,status,brand,model,category")
      .eq("store_id", store.id)
      .in("id", listingIds.slice(start, start + 200));
    if (error) return exportFailed("listings", error);
    for (const row of (data ?? []) as unknown as NonNullable<ExportItem["listing"]>[]) listings.set(row.id, row);
  }

  const exportItems = items.map((item) => ({ ...item, listing: item.listing_id ? listings.get(item.listing_id) ?? null : null }));
  const base = exportRows(exportItems);
  const rows = withListing ? base.map((row, index) => [...row, ...listingColumns(exportItems[index])]) : base;
  const columnHeaders = exportHeaders(withListing);
  const filename = exportFilename(store.slug, format);
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") {
    return new NextResponse(toCsv(rows, columnHeaders), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  const body = writeXlsx([toXlsxSheet(rows, columnHeaders)]);
  return new NextResponse(Buffer.from(body), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
