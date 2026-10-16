import { NextResponse } from "next/server";
import { buildReportCsv, type ReportRow } from "@/lib/store-import/report";
import { readImportRows, readImportSession } from "@/lib/store-import/server";
import { importClient, importErrorResponse, importJson, isImportSessionId, NO_STORE } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// The per-row result report as a formula-safe CSV (design §7.6).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isImportSessionId(id)) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
  const auth = await importClient(request, false);
  if ("response" in auth) return auth.response;
  try {
    const session = await readImportSession(auth.db, id);
    if (!session) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
    const rows: ReportRow[] = [];
    let after = 0;
    for (let page = 0; page < 25; page += 1) {
      const batch = (await readImportRows(auth.db, id, "all", after, 100)) as unknown as ReportRow[];
      rows.push(...batch);
      if (batch.length < 100) break;
      after = batch[batch.length - 1].row_number;
    }
    const day = (session.committed_at ?? session.updated_at).slice(0, 10);
    return new NextResponse(buildReportCsv(rows), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventario-resultado-${day}.csv"`,
      },
    });
  } catch (error) {
    return importErrorResponse(error);
  }
}
