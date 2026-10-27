import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Feature ideas, store-locations batch, run-03: the store's Nubefact token at rest. AES-256-GCM with the server key
// LARIA_EINVOICE_KEY (32 bytes, base64 or hex) and the store id as associated data, so a ciphertext copied to another
// store does not open. Without a valid key the feature is off (fails closed). Server only.

export function einvoiceKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.LARIA_EINVOICE_KEY?.trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return key.length === 32 ? key : null;
}

export function einvoiceAvailable(env: Record<string, string | undefined> = process.env) {
  return einvoiceKey(env) !== null;
}

export function sealToken(token: string, storeId: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(storeId, "utf8"));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function openToken(sealed: string, storeId: string, key: Buffer): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    decipher.setAAD(Buffer.from(storeId, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function tokenHint(token: string) {
  return token.slice(-4);
}
