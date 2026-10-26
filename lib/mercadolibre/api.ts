import "server-only";

import { ML_API_URL, type MercadoLibreConfig } from "./config";
import { ML_ITEM_ID, ML_PAGE_SIZE, isMlPhotoUrl, type MlItem } from "./mapping";

// reach-01: the few Mercado Libre API calls the import needs, each with a deadline and a size limit. Tests pass their
// own fetch; nothing here runs without the store's own authorization.

export type Fetcher = typeof fetch;

export class MercadoLibreError extends Error {
  constructor(public readonly code: string, public readonly userMessage: string, public readonly status = 502) {
    super(code);
  }
}

const CALL_MS = 8_000;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const ITEM_ATTRIBUTES = "id,title,price,currency_id,available_quantity,condition,pictures,attributes,seller_custom_field,category_id,variations,permalink,status";

async function readJson(response: Response) {
  const text = await response.text();
  if (text.length > MAX_JSON_BYTES) throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "Mercado Libre respondió algo inesperado. Intenta de nuevo.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "Mercado Libre respondió algo inesperado. Intenta de nuevo.");
  }
}

async function call(fetcher: Fetcher, url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(CALL_MS) });
  } catch {
    throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "No pudimos comunicarnos con Mercado Libre. Intenta de nuevo en unos minutos.", 503);
  }
  if (response.status === 401 || response.status === 403) {
    throw new MercadoLibreError("MERCADOLIBRE_AUTH", "Mercado Libre ya no acepta la conexión. Vuelve a conectar tu cuenta.", 401);
  }
  if (response.status === 429) {
    throw new MercadoLibreError("MERCADOLIBRE_BUSY", "Mercado Libre pidió esperar un momento. Intenta de nuevo en un minuto.", 429);
  }
  if (!response.ok) throw new MercadoLibreError("MERCADOLIBRE_UNAVAILABLE", "Mercado Libre no respondió como esperábamos. Intenta de nuevo.");
  return readJson(response);
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: "application/json" };
}

export type MlTokens = { accessToken: string; refreshToken: string | null; expiresAt: Date; userId: number; scope: string | null };

function parseTokens(body: unknown, now = Date.now()): MlTokens {
  const value = (body ?? {}) as Record<string, unknown>;
  const userId = Number(value.user_id);
  const expiresIn = Number(value.expires_in);
  if (typeof value.access_token !== "string" || !value.access_token || !Number.isSafeInteger(userId) || userId < 1) {
    throw new MercadoLibreError("MERCADOLIBRE_TOKEN_INVALID", "Mercado Libre no devolvió una conexión válida. Vuelve a intentarlo.");
  }
  return {
    accessToken: value.access_token,
    refreshToken: typeof value.refresh_token === "string" && value.refresh_token ? value.refresh_token : null,
    // A minute early, so a token is never used at its last second.
    expiresAt: new Date(now + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 21600) * 1000 - 60_000),
    userId,
    scope: typeof value.scope === "string" ? value.scope.slice(0, 400) : null,
  };
}

async function tokenRequest(fetcher: Fetcher, form: Record<string, string>) {
  const body = await call(fetcher, `${ML_API_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  }).catch((error) => {
    if (error instanceof MercadoLibreError && error.code === "MERCADOLIBRE_UNAVAILABLE") {
      throw new MercadoLibreError("MERCADOLIBRE_TOKEN_INVALID", "Mercado Libre no aceptó la autorización. Vuelve a intentarlo.");
    }
    throw error;
  });
  return parseTokens(body);
}

export function exchangeCode(config: MercadoLibreConfig, code: string, verifier: string, fetcher: Fetcher = fetch) {
  return tokenRequest(fetcher, {
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });
}

export function refreshTokens(config: MercadoLibreConfig, refreshToken: string, fetcher: Fetcher = fetch) {
  return tokenRequest(fetcher, {
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });
}

export async function fetchNickname(token: string, fetcher: Fetcher = fetch) {
  const body = (await call(fetcher, `${ML_API_URL}/users/me`, { headers: bearer(token) })) as { nickname?: unknown } | null;
  return typeof body?.nickname === "string" ? body.nickname.slice(0, 120) : null;
}

// One page of the account's active publications: their codes and the total.
export async function fetchItemIds(token: string, userId: number, offset: number, fetcher: Fetcher = fetch) {
  const safeOffset = Math.max(0, Math.min(Math.floor(offset), 950));
  const url = `${ML_API_URL}/users/${userId}/items/search?status=active&limit=${ML_PAGE_SIZE}&offset=${safeOffset}`;
  const body = (await call(fetcher, url, { headers: bearer(token) })) as { results?: unknown; paging?: { total?: unknown } } | null;
  const ids = Array.isArray(body?.results) ? body.results.filter((id): id is string => typeof id === "string" && ML_ITEM_ID.test(id)) : [];
  const total = Number(body?.paging?.total);
  return { ids, total: Number.isSafeInteger(total) && total >= 0 ? total : ids.length, offset: safeOffset };
}

// Up to 20 publications per call (multiget). Those of another seller are dropped: the import takes only the account's own.
export async function fetchItems(token: string, ids: string[], userId: number, fetcher: Fetcher = fetch): Promise<MlItem[]> {
  const items: MlItem[] = [];
  const valid = [...new Set(ids.filter((id) => ML_ITEM_ID.test(id)))];
  for (let index = 0; index < valid.length; index += 20) {
    const chunk = valid.slice(index, index + 20);
    const url = `${ML_API_URL}/items?ids=${chunk.join(",")}&attributes=${ITEM_ATTRIBUTES},seller_id`;
    const body = await call(fetcher, url, { headers: bearer(token) });
    for (const entry of Array.isArray(body) ? body : []) {
      const item = (entry as { code?: number; body?: MlItem & { seller_id?: number } }).body;
      if ((entry as { code?: number }).code === 200 && item && typeof item.id === "string" && Number(item.seller_id) === userId) items.push(item);
    }
  }
  return items;
}

export async function fetchDescription(token: string, id: string, fetcher: Fetcher = fetch) {
  if (!ML_ITEM_ID.test(id)) return "";
  try {
    const body = (await call(fetcher, `${ML_API_URL}/items/${id}/description`, { headers: bearer(token) })) as { plain_text?: unknown } | null;
    return typeof body?.plain_text === "string" ? body.plain_text : "";
  } catch (error) {
    // A publication without a description answers 404; the row then asks for one in the review.
    if (error instanceof MercadoLibreError && error.code === "MERCADOLIBRE_UNAVAILABLE") return "";
    throw error;
  }
}

export async function fetchCategoryPath(id: string, fetcher: Fetcher = fetch) {
  if (!/^[A-Z]{3}\d{1,12}$/.test(id)) return [];
  try {
    const body = (await call(fetcher, `${ML_API_URL}/categories/${id}`)) as { path_from_root?: { name?: unknown }[] } | null;
    return (body?.path_from_root ?? []).map((node) => (typeof node.name === "string" ? node.name : "")).filter(Boolean);
  } catch {
    return [];
  }
}

// A photo from Mercado Libre's image hosts, never past the import's 5 MB limit and never through a redirect.
export async function fetchPhoto(url: string, maxBytes: number, fetcher: Fetcher = fetch): Promise<Uint8Array | null> {
  if (!isMlPhotoUrl(url)) return null;
  let response: Response;
  try {
    response = await fetcher(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    return null;
  }
  if (!response.ok || !response.body) return null;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return bytes;
}

// Runs `work` over `values` with at most `limit` at a time, keeping the order.
export async function mapLimited<T, R>(values: T[], limit: number, work: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await work(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
