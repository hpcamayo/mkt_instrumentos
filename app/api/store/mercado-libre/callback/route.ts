import { cookies } from "next/headers";
import { exchangeCode, fetchNickname, MercadoLibreError } from "@/lib/mercadolibre/api";
import { encryptToken, readState, sameSecret } from "@/lib/mercadolibre/crypto";
import { backToPage, ML_COOKIE_PATH, ML_STATE_COOKIE, mlOwner } from "@/lib/mercadolibre/routes";
import { storeReachDb } from "@/lib/store-reach-db";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

// reach-01: Mercado Libre sends the owner back here (a top-level GET from its site) with a code and the state. The
// state must match the signed cookie, which must belong to the signed-in owner and be under 10 minutes old; the code
// is exchanged with the PKCE verifier, and the tokens are stored encrypted for the owner's store.
export async function GET(request: Request) {
  const auth = await mlOwner(request, false);
  if ("response" in auth) return finish(request, auth.response.status === 401 ? "ingresa" : "no-disponible");
  const url = new URL(request.url);
  const jar = await cookies();
  const saved = readState(auth.config.key, jar.get(ML_STATE_COOKIE)?.value);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (url.searchParams.get("error")) return finish(request, "cancelado");
  if (!saved || saved.uid !== auth.userId || !state || !sameSecret(saved.state, state) || !/^[A-Za-z0-9_-]{1,200}$/.test(code)) {
    return finish(request, "vencido");
  }
  try {
    const tokens = await exchangeCode(auth.config, code, saved.verifier);
    const nickname = await fetchNickname(tokens.accessToken).catch(() => null);
    const admin = getSupabaseAdminClient();
    if (!admin) return finish(request, "no-disponible");
    const db = storeReachDb(admin);
    // The store id seals the tokens to its row.
    const { data: storeRow } = await db.from("stores").select("id").eq("owner_user_id", auth.userId).maybeSingle();
    const storeId = (storeRow as { id?: string } | null)?.id;
    if (!storeId) return finish(request, "tienda-inactiva");
    const { error } = await db.rpc("save_mercadolibre_connection", {
      p_owner_user_id: auth.userId,
      p_ml_user_id: tokens.userId,
      p_nickname: nickname,
      p_access_token_enc: encryptToken(auth.config.key, storeId, tokens.accessToken),
      p_refresh_token_enc: tokens.refreshToken ? encryptToken(auth.config.key, storeId, tokens.refreshToken) : null,
      p_expires_at: tokens.expiresAt.toISOString(),
      p_scope: tokens.scope,
    });
    if (error) return finish(request, /STORE_NOT_ACTIVE/.test(error.message) ? "tienda-inactiva" : "error");
    return finish(request, "conectado");
  } catch (error) {
    if (!(error instanceof MercadoLibreError)) console.error("mercadolibre_callback_failure", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    return finish(request, "error");
  }
}

function finish(request: Request, result: string) {
  const response = backToPage(request, result);
  response.cookies.set(ML_STATE_COOKIE, "", { path: ML_COOKIE_PATH, maxAge: 0, httpOnly: true, sameSite: "lax" });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
