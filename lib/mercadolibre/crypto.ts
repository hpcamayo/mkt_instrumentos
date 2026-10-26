import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// reach-01: the stores' Mercado Libre tokens are stored encrypted (AES-256-GCM, a fresh IV each time, the store id as
// associated data so a token cannot be moved to another store's row), and the OAuth state travels in a signed cookie.

const VERSION = "v1";

function b64url(value: Buffer) {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Separate keys for encryption and signing, derived from the one secret.
function subkey(key: Buffer, purpose: string) {
  return createHmac("sha256", key).update(`laria-mercadolibre:${purpose}`).digest();
}

export function encryptToken(key: Buffer, storeId: string, token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey(key, "tokens"), iv);
  cipher.setAAD(Buffer.from(storeId));
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(body)].join(".");
}

export function decryptToken(key: Buffer, storeId: string, value: string) {
  const [version, iv, tag, body] = value.split(".");
  if (version !== VERSION || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", subkey(key, "tokens"), fromB64url(iv));
    decipher.setAAD(Buffer.from(storeId));
    decipher.setAuthTag(fromB64url(tag));
    return Buffer.concat([decipher.update(fromB64url(body)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32) {
  return b64url(randomBytes(bytes));
}

// PKCE (RFC 7636): the challenge sent to Mercado Libre is the S256 hash of the verifier kept in the cookie.
export function pkceChallenge(verifier: string) {
  return b64url(createHash("sha256").update(verifier).digest());
}

export type OAuthState = { state: string; verifier: string; uid: string; exp: number };

export function signState(key: Buffer, value: OAuthState) {
  const payload = b64url(Buffer.from(JSON.stringify(value)));
  return `${payload}.${b64url(createHmac("sha256", subkey(key, "oauth-state")).update(payload).digest())}`;
}

export function readState(key: Buffer, cookie: string | undefined, now = Date.now()): OAuthState | null {
  const [payload, signature] = (cookie ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", subkey(key, "oauth-state")).update(payload).digest();
  const given = fromB64url(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(fromB64url(payload).toString("utf8")) as OAuthState;
    if (typeof value.state !== "string" || typeof value.verifier !== "string" || typeof value.uid !== "string" || typeof value.exp !== "number") return null;
    return value.exp > now ? value : null;
  } catch {
    return null;
  }
}

export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
