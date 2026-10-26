import "server-only";

import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MercadoLibreError } from "./api";
import { mercadoLibreConfig, type MercadoLibreConfig } from "./config";

// reach-01: shared by the Mercado Libre routes. Every route is off without the configuration, needs the signed-in
// owner, and (for writes) a same-origin request.

export const ML_PAGE_PATH = "/mi-cuenta/tienda/mercado-libre";
export const ML_STATE_COOKIE = "laria-ml-oauth";
export const ML_COOKIE_PATH = "/api/store/mercado-libre";
export const NO_STORE = { "Cache-Control": "private, no-store" };

export function mlJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function mlFailure(error: unknown) {
  if (error instanceof MercadoLibreError) return mlJson({ ok: false, code: error.code, message: error.userMessage }, error.status);
  console.error("mercadolibre_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  return mlJson({ ok: false, code: "MERCADOLIBRE_UNAVAILABLE", message: "No pudimos completar el pedido. Intenta de nuevo." }, 503);
}

export async function mlOwner(request: Request, write: boolean): Promise<
  { config: MercadoLibreConfig; db: SupabaseClient; userId: string } | { response: NextResponse }
> {
  if (write && !sameOriginEventRequest(request)) return { response: mlJson({ ok: false, message: "Solicitud inválida." }, 403) };
  const config = mercadoLibreConfig();
  if (!config) return { response: mlJson({ ok: false, code: "MERCADOLIBRE_OFF", message: "La importación desde Mercado Libre no está disponible por ahora." }, 503) };
  const client = await getSupabaseServerClient();
  const { data } = client ? await client.auth.getUser() : { data: null };
  if (!client || !data?.user) return { response: mlJson({ ok: false, message: "Ingresa con tu cuenta de tienda." }, 401) };
  return { config, db: client as unknown as SupabaseClient, userId: data.user.id };
}

// Where a top-level step (connect, callback) sends the owner back, with a short result code the page explains.
export function backToPage(request: Request, result: string) {
  return NextResponse.redirect(new URL(`${ML_PAGE_PATH}?resultado=${encodeURIComponent(result)}`, request.url), 303);
}
