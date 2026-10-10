import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseCatalogSource, getCatalogSupabaseClient } from "@/lib/catalog-intelligence/catalog-resolver";
import { isAutofillPrototypeEnabled } from "@/lib/catalog-intelligence/config";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// The prototype answers only when CATALOG_AUTOFILL_PROTOTYPE=1 and the caller is an Admin. Production sets neither,
// so these routes are a 404 there and the V1 publication form is unchanged.
export async function prototypeAccess(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!isAutofillPrototypeEnabled()) return { ok: false, response: NextResponse.json({ message: "No encontrado." }, { status: 404 }) };
  const client = await getSupabaseServerClient();
  const { data: isAdmin, error } = client ? await client.rpc("is_admin") : { data: null, error: true };
  if (error || isAdmin !== true) return { ok: false, response: NextResponse.json({ message: "Solo para administradores." }, { status: 403 }) };
  return { ok: true };
}

export function prototypeCatalogSource() {
  const client = getCatalogSupabaseClient();
  return client ? createSupabaseCatalogSource(client) : null;
}

export const noStore = { "Cache-Control": "private, no-store" };
