import "server-only";

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import { importJson, isImportSessionId } from "./route-helpers";

// Like importClient(), plus the signed-in user's id, which the photo completion step passes to the service-role check.
export async function photoOwner(request: Request, id: string, write: boolean): Promise<{ db: SupabaseClient; userId: string } | { response: NextResponse }> {
  if (!isImportSessionId(id)) return { response: importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404) };
  if (write && !sameOriginEventRequest(request)) {
    return { response: importJson({ code: "IMPORT_FORBIDDEN", message: "Solicitud inválida." }, 403) };
  }
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) {
    return { response: importJson({ code: "IMPORT_AUTH_REQUIRED", message: "Ingresa con tu cuenta de tienda." }, 401) };
  }
  return { db: client as unknown as SupabaseClient, userId: data.user.id };
}
