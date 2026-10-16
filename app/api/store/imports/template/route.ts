import { NextResponse } from "next/server";
import { XLSX_CONTENT_TYPE } from "@/lib/spreadsheet/xlsx-write";
import { buildTemplateCsv, buildTemplateXlsx } from "@/lib/store-import/template";

// The import template (design §7.3): ?format=xlsx|csv&category=<category value>. Public: it holds no store data.
export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const category = search.get("category");
  const cache = { "Cache-Control": "public, max-age=3600" };
  if (search.get("format") === "csv") {
    return new NextResponse(buildTemplateCsv(category), {
      headers: { ...cache, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="plantilla-inventario-laria.csv"' },
    });
  }
  return new NextResponse(Buffer.from(buildTemplateXlsx(category)), {
    headers: { ...cache, "Content-Type": XLSX_CONTENT_TYPE, "Content-Disposition": 'attachment; filename="plantilla-inventario-laria.xlsx"' },
  });
}
