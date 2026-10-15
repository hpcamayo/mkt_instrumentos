import { applyImportAction, nextFor, parseImportAction, readImportSession } from "@/lib/store-import/server";
import { importClient, importErrorResponse, importJson, isImportSessionId } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isImportSessionId(id)) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
  const auth = await importClient(request, false);
  if ("response" in auth) return auth.response;
  try {
    const session = await readImportSession(auth.db, id);
    if (!session) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
    return importJson({ session, next: nextFor(session) });
  } catch (error) {
    return importErrorResponse(error);
  }
}

// Merchant decisions: confirm the column mapping, include or exclude rows, confirm the commit, review the rows that
// did not apply, or cancel.
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isImportSessionId(id)) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
  const auth = await importClient(request, true);
  if ("response" in auth) return auth.response;
  const action = parseImportAction(await request.json().catch(() => null));
  if (!action) return importJson({ code: "IMPORT_REQUEST_INVALID", message: "Solicitud inválida." }, 400);
  try {
    return importJson(await applyImportAction(auth.db, id, action));
  } catch (error) {
    return importErrorResponse(error);
  }
}
