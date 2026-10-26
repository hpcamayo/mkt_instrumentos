import { mlFailure, mlJson } from "@/lib/mercadolibre/routes";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";

// reach-01: the owner disconnects; the stored tokens are deleted. Works even when the integration is off, so leaving
// is always possible. Mercado Libre keeps the app in the account's "Aplicaciones conectadas" until the owner removes it.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return mlJson({ ok: false, message: "Solicitud inválida." }, 403);
  const supabase = await getSupabaseServerClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: null };
  if (!supabase || !data?.user) return mlJson({ ok: false, message: "Ingresa con tu cuenta de tienda." }, 401);
  const { error } = await storeReachDb(supabase).rpc("disconnect_mercadolibre");
  if (error) return mlFailure(error);
  return mlJson({ ok: true });
}
