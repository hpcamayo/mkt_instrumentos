import { NextResponse } from "next/server";
import { parseReorderFile, reorderCsv, reorderFilename, reorderXlsxSheet } from "@/lib/inventory-reorder";
import { readSpreadsheet } from "@/lib/store-import/sheet";
import { ImportFileError } from "@/lib/store-import/types";
import { writeXlsx, XLSX_CONTENT_TYPE } from "@/lib/spreadsheet/xlsx-write";
import { getReorderList } from "@/lib/store-inventory";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// Effortless Laria, inventory batch, stock-07 (docs/ux-effortless/inventory.md).
// GET ?format=csv|xlsx: the reorder file (get_reorder_list).
// POST a filled file: what it would add, SKU by SKU. Nothing is written here; the page applies the lines with one
// all-or-nothing "Reponer stock" batch (apply_bulk_stock_operations) after the owner confirms.

async function owner() {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { error: NextResponse.json({ message: "No se pudo validar tu cuenta." }, { status: 503 }) };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { error: NextResponse.json({ message: "Ingresa a tu cuenta." }, { status: 401 }) };
  const { data: store } = await supabase.from("stores").select("id,slug").eq("owner_user_id", userData.user.id).maybeSingle();
  if (!store) return { error: NextResponse.json({ message: "Necesitas una tienda para usar Inventario." }, { status: 404 }) };
  return { supabase, store };
}

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const context = await owner();
  if ("error" in context) return context.error;
  const rows = await getReorderList(context.supabase);
  if (!rows) return NextResponse.json({ message: "No se pudo preparar la lista de reposición." }, { status: 500 });
  const headers = {
    "Content-Disposition": `attachment; filename="${reorderFilename(context.store.slug, format)}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (format === "csv") return new NextResponse(reorderCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  return new NextResponse(Buffer.from(writeXlsx([reorderXlsxSheet(rows)])), { headers: { ...headers, "Content-Type": XLSX_CONTENT_TYPE } });
}

type Item = { id: string; merchant_sku: string; product_name: string; quantity_available: number; inventory_status: string; version: number };

export async function POST(request: Request) {
  const context = await owner();
  if ("error" in context) return context.error;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Elige el archivo de reposición." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let sheet;
  try {
    sheet = readSpreadsheet(bytes, /\.xlsx$/i.test(file.name) ? "xlsx" : "csv");
  } catch (error) {
    const message = error instanceof ImportFileError ? error.userMessage : "No pudimos leer el archivo. Sube un .xlsx o un .csv.";
    return NextResponse.json({ message }, { status: 400 });
  }
  const parsed = parseReorderFile(sheet.headers, sheet.rows);
  if (parsed.error) return NextResponse.json({ message: parsed.error }, { status: 400 });

  const items = new Map<string, Item>();
  const skus = [...new Set(parsed.lines.map((line) => line.sku.toUpperCase()))];
  for (let start = 0; start < skus.length; start += 200) {
    const { data, error } = await context.supabase
      .from("store_inventory_items")
      .select("id,merchant_sku,product_name,quantity_available,inventory_status,version,sku_normalized")
      .eq("store_id", context.store.id)
      .in("sku_normalized", skus.slice(start, start + 200));
    if (error) return NextResponse.json({ message: "No se pudo revisar el archivo. Intenta de nuevo." }, { status: 500 });
    for (const row of (data ?? []) as (Item & { sku_normalized: string })[]) items.set(row.sku_normalized, row);
  }

  const problems = [...parsed.problems];
  const lines = [];
  for (const line of parsed.lines) {
    const item = items.get(line.sku.toUpperCase());
    if (!item) problems.push({ row: line.row, sku: line.sku, message: "No hay un SKU así en tu inventario." });
    else if (item.inventory_status !== "active") problems.push({ row: line.row, sku: line.sku, message: "El SKU está archivado; reactívalo primero." });
    else lines.push({ ...line, item_id: item.id, product_name: item.product_name, quantity_available: item.quantity_available });
  }
  problems.sort((a, b) => a.row - b.row);
  return NextResponse.json({ ok: true, lines, problems, warnings: sheet.warnings });
}
