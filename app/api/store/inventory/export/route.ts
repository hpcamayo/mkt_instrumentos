import { NextResponse } from "next/server";
import { exportFilename, exportRows, toCsv, toXlsxSheet, type ExportItem } from "@/lib/inventory-export";
import { writeXlsx } from "@/lib/spreadsheet/xlsx-write";
import { UUID, inventoryDb } from "@/lib/store-inventory";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// GET /api/store/inventory/export?format=csv|xlsx[&ids=…] (design §7.8). Reads the caller's own store through RLS,
// explicitly filtered by that store so an Admin session (which RLS lets read every store) still exports only a
// store it owns. Archived SKU are included only when selected by id.

const PAGE = 1000;
const MAX_ROWS = 10000;

// Any failed lookup stops the export: a file with blank columns would look complete (Codex review 3, finding 7).
function exportFailed(step: string, error: { code?: string; message?: string }) {
  console.error("inventory export failed", step, error.code, error.message);
  return NextResponse.json({ message: "No se pudo preparar la exportación." }, { status: 500 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : url.searchParams.get("format") === "csv" ? "csv" : null;
  if (!format) return NextResponse.json({ message: "Formato no compatible." }, { status: 400 });
  const idsParam = url.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : null;
  if (ids && (ids.length > 200 || !ids.every((id) => UUID.test(id)))) {
    return NextResponse.json({ message: "Selección inválida." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ message: "No se pudo validar tu cuenta." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ message: "Ingresa a tu cuenta." }, { status: 401 });
  const { data: store, error: storeError } = await supabase.from("stores").select("id,slug").eq("owner_user_id", userData.user.id).maybeSingle();
  if (storeError) return exportFailed("store", storeError);
  if (!store) return NextResponse.json({ message: "Necesitas una tienda para exportar inventario." }, { status: 404 });

  const db = inventoryDb(supabase);
  const items: (Omit<ExportItem, "listing"> & { listing_id: string | null })[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = db
      .from("store_inventory_items")
      .select("merchant_sku,product_name,variant_label,quantity_on_hand,quantity_available,unit_price_pen,low_stock_threshold,external_reference,inventory_status,listing_id")
      .eq("store_id", store.id)
      .order("sku_normalized", { ascending: true })
      .range(from, from + PAGE - 1);
    query = ids ? query.in("id", ids) : query.eq("inventory_status", "active");
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
      .select("id,slug,status,brand,model,category")
      .eq("store_id", store.id)
      .in("id", listingIds.slice(start, start + 200));
    if (error) return exportFailed("listings", error);
    for (const row of data ?? []) listings.set(row.id, row);
  }

  const rows = exportRows(items.map((item) => ({ ...item, listing: item.listing_id ? listings.get(item.listing_id) ?? null : null })));
  const filename = exportFilename(store.slug, format);
  const headers = {
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") {
    return new NextResponse(toCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  }
  const body = writeXlsx([toXlsxSheet(rows)]);
  return new NextResponse(Buffer.from(body), {
    headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
}
