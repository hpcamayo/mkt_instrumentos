import { copyPhotos, photoCounts } from "@/lib/mercadolibre/server";
import { mlFailure, mlJson, mlOwner } from "@/lib/mercadolibre/routes";
import { isImportSessionId } from "@/lib/store-import/route-helpers";
import { ImportRequestError } from "@/lib/store-import/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-01: the photos of an import made from Mercado Libre. GET ?importacion=<id> counts them; POST { sessionId }
// copies the next few into the import (the page calls again until none are left).
export async function GET(request: Request) {
  const auth = await mlOwner(request, false);
  if ("response" in auth) return auth.response;
  const sessionId = new URL(request.url).searchParams.get("importacion") ?? "";
  if (!isImportSessionId(sessionId)) return mlJson({ ok: false, message: "Solicitud inválida." }, 400);
  try {
    return mlJson({ ok: true, counts: await photoCounts(auth.db, sessionId) });
  } catch (error) {
    return mlFailure(error);
  }
}

export async function POST(request: Request) {
  const auth = await mlOwner(request, true);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  if (!isImportSessionId(sessionId)) return mlJson({ ok: false, message: "Solicitud inválida." }, 400);
  try {
    return mlJson({ ok: true, counts: await copyPhotos(auth.db, auth.userId, sessionId) });
  } catch (error) {
    if (error instanceof ImportRequestError) return mlJson({ ok: false, code: error.code, message: error.userMessage }, error.status);
    return mlFailure(error);
  }
}
