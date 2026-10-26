import "server-only";

import { absoluteUrl } from "@/lib/site";

// reach-01 "Importar desde Mercado Libre": the integration is off, and every route fails closed, until the server has
// Laria's Mercado Libre application credentials and a key to encrypt the stores' tokens:
//   MERCADOLIBRE_CLIENT_ID, MERCADOLIBRE_CLIENT_SECRET  the application registered at developers.mercadolibre.com.pe
//   MERCADOLIBRE_TOKEN_KEY                              32 random bytes, base64 or hex (AES-256-GCM, cookie signing)
//   MERCADOLIBRE_REDIRECT_URI (optional)                defaults to <site>/api/store/mercado-libre/callback; it must
//                                                       match the one registered for the application
export const ML_AUTH_URL = "https://auth.mercadolibre.com.pe/authorization";
export const ML_API_URL = "https://api.mercadolibre.com";

export type MercadoLibreConfig = { clientId: string; clientSecret: string; key: Buffer; redirectUri: string };

export function tokenKey(value: string | undefined) {
  const text = (value ?? "").trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, "hex");
  if (/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) {
    const key = Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    return key.length === 32 ? key : null;
  }
  return null;
}

export function mercadoLibreConfig(env: Record<string, string | undefined> = process.env): MercadoLibreConfig | null {
  const clientId = env.MERCADOLIBRE_CLIENT_ID?.trim();
  const clientSecret = env.MERCADOLIBRE_CLIENT_SECRET?.trim();
  const key = tokenKey(env.MERCADOLIBRE_TOKEN_KEY);
  if (!clientId || !/^\d{1,30}$/.test(clientId) || !clientSecret || !key) return null;
  const redirect = env.MERCADOLIBRE_REDIRECT_URI?.trim();
  const redirectUri = redirect && /^https:\/\/[^\s]+$/.test(redirect) ? redirect : absoluteUrl("/api/store/mercado-libre/callback");
  return { clientId, clientSecret, key, redirectUri };
}
