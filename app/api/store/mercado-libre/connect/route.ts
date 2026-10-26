import { NextResponse } from "next/server";
import { ML_AUTH_URL } from "@/lib/mercadolibre/config";
import { pkceChallenge, randomToken, signState } from "@/lib/mercadolibre/crypto";
import { backToPage, ML_COOKIE_PATH, ML_STATE_COOKIE, mlOwner } from "@/lib/mercadolibre/routes";
import { storeReachDb } from "@/lib/store-reach-db";

export const dynamic = "force-dynamic";

// reach-01: the owner's "Conectar con Mercado Libre" (a form POST from the page). Sends them to Mercado Libre's own
// authorization page with a fresh state and a PKCE challenge; the state, the verifier and the owner travel in a signed,
// short-lived cookie that only the callback reads. Laria never sees the Mercado Libre password.
export async function POST(request: Request) {
  const auth = await mlOwner(request, true);
  if ("response" in auth) return auth.response.status === 401 ? backToPage(request, "ingresa") : backToPage(request, auth.response.status === 503 ? "no-disponible" : "solicitud");
  const { data, error } = await storeReachDb(auth.db).rpc("get_mercadolibre_connection");
  if (error || (data as { store_status?: string } | null)?.store_status !== "active") return backToPage(request, "tienda-inactiva");

  const state = randomToken();
  const verifier = randomToken(48);
  const url = new URL(ML_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", auth.config.clientId);
  url.searchParams.set("redirect_uri", auth.config.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(ML_STATE_COOKIE, signState(auth.config.key, { state, verifier, uid: auth.userId, exp: Date.now() + 10 * 60_000 }), {
    path: ML_COOKIE_PATH, maxAge: 600, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
