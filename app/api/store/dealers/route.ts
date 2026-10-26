import { NextResponse } from "next/server";
import { DEALER_DOCUMENT_MAX_BYTES, DEALER_DOCUMENT_TYPES, parseDealerAuthorization } from "@/lib/dealers";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-04 "Distribuidor oficial": the owner opens a request for one brand (the database issues the upload path in the
// private bucket) or withdraws one. The database binds the store to the signed-in owner.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Solicitud inválida.");
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401);
  const db = storeReachDb(supabase);

  if (body.action === "request") {
    const allowed = ["action", "brand", "fileName", "fileType", "fileBytes", "validUntil", "note"];
    if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.brand !== "string" || typeof body.fileName !== "string"
      || !DEALER_DOCUMENT_TYPES.includes(body.fileType) || !Number.isSafeInteger(body.fileBytes) || body.fileBytes < 1 || body.fileBytes > DEALER_DOCUMENT_MAX_BYTES
      || (body.validUntil !== undefined && body.validUntil !== null && !(typeof body.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.validUntil)))
      || (body.note !== undefined && body.note !== null && typeof body.note !== "string")) {
      return failure("Solicitud inválida.");
    }
    const { data, error } = await db.rpc("request_dealer_authorization_upload", {
      p_brand: body.brand.slice(0, 80),
      p_file_name: body.fileName.slice(0, 200),
      p_file_type: body.fileType,
      p_file_bytes: body.fileBytes,
      p_valid_until: body.validUntil ?? null,
      p_note: typeof body.note === "string" ? body.note.slice(0, 600) : null,
    });
    if (error) return failure(storeReachErrorMessage(error, "No se pudo abrir la solicitud. Intenta nuevamente."));
    const authorization = parseDealerAuthorization(data);
    const upload = (data as { upload?: { bucket?: unknown; path?: unknown } } | null)?.upload;
    if (!authorization || upload?.bucket !== "store-dealer-documents" || typeof upload.path !== "string") return failure("No se pudo abrir la solicitud.", 500);
    return NextResponse.json({ ok: true, authorization, upload: { bucket: upload.bucket, path: upload.path } }, { headers: { "Cache-Control": "no-store" } });
  }

  if (body.action === "withdraw") {
    if (Object.keys(body).some((key) => !["action", "id"].includes(key)) || !isEntityId(body.id)) return failure("Solicitud inválida.");
    const { data, error } = await db.rpc("withdraw_dealer_authorization", { p_id: body.id });
    if (error) return failure(storeReachErrorMessage(error, "No se pudo retirar. Intenta nuevamente."));
    return NextResponse.json({ ok: true, authorization: parseDealerAuthorization(data) }, { headers: { "Cache-Control": "no-store" } });
  }

  return failure("Solicitud inválida.");
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
