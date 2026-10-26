import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { DEALER_DOCUMENT_MAX_BYTES, detectDealerDocumentType, parseDealerAuthorizations } from "@/lib/dealers";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const maxDuration = 30;

const EXTENSIONS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// reach-04 "Distribuidor oficial": after the owner uploaded the authorization, the server reads the bytes with the
// service role and checks what they are (never the name or the browser's type) before the request reaches Admin. A
// file that is not the declared PDF or image is deleted, so the owner can upload again to the same request.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const { id } = await params;
  if (!isEntityId(id)) return failure("Solicitud inválida.");
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return failure("No pudimos revisar el archivo en este momento.", 503);
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return failure("Ingresa a tu cuenta.", 401);

  // The owner's own list decides which request is theirs; the service role only reads that path.
  const { data: rows, error: listError } = await storeReachDb(supabase).rpc("get_store_dealer_authorizations");
  if (listError) return failure(storeReachErrorMessage(listError, "No pudimos revisar el archivo."));
  const row = parseDealerAuthorizations(rows).find((item) => item.id === id && item.status === "awaiting_document");
  if (!row) return failure("Esta solicitud ya no espera un archivo.", 404);
  const path = `${user.id}/${id}/autorizacion.${EXTENSIONS[row.documentType]}`;

  const service = storeReachDb(admin);
  const { data: blob, error: downloadError } = await service.storage.from("store-dealer-documents").download(path);
  if (downloadError || !blob) return failure("Todavía no recibimos el archivo. Vuelve a subirlo.", 409);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const detected = bytes.byteLength <= DEALER_DOCUMENT_MAX_BYTES ? detectDealerDocumentType(bytes) : null;
  if (detected !== row.documentType) {
    await service.storage.from("store-dealer-documents").remove([path]);
    return failure(bytes.byteLength > DEALER_DOCUMENT_MAX_BYTES
      ? "El archivo pesa más de 5 MB."
      : "El archivo no es un PDF, JPG, PNG o WebP válido. Vuelve a subirlo.");
  }
  const { data, error } = await service.rpc("complete_dealer_authorization_upload", {
    p_id: id,
    p_owner: user.id,
    p_document_type: detected,
    p_document_bytes: bytes.byteLength,
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  if (error) return failure(storeReachErrorMessage(error, "No pudimos revisar el archivo. Intenta nuevamente."));
  return NextResponse.json({ ok: true, authorization: data }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
