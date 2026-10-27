import "server-only";

import { NextResponse } from "next/server";
import type { DatabaseClient } from "@/lib/supabase/database";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { ImportRequestError } from "./server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const NO_STORE = { "Cache-Control": "private, no-store" };

export function isImportSessionId(value: string) {
  return UUID.test(value);
}

export function importJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function importErrorResponse(error: unknown) {
  if (error instanceof ImportRequestError) {
    return importJson({ code: error.code, message: error.userMessage }, error.status);
  }
  console.error("store_import_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return importJson({ code: "IMPORT_UNAVAILABLE", message: "No pudimos continuar la importación. Intenta de nuevo." }, 503);
}

// The signed-in owner's client. Writes also require a same-origin request (the cookie session is the credential).
export async function importClient(request: Request, write: boolean): Promise<{ db: DatabaseClient } | { response: NextResponse }> {
  if (write && !sameOriginEventRequest(request)) {
    return { response: importJson({ code: "IMPORT_FORBIDDEN", message: "Solicitud inválida." }, 403) };
  }
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) {
    return { response: importJson({ code: "IMPORT_AUTH_REQUIRED", message: "Ingresa con tu cuenta de tienda." }, 401) };
  }
  return { db: client };
}
