import "server-only";

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";

// big-12 (docs/ux-effortless/speed.md): Web Push with Node's own crypto. Each message is encrypted for the browser
// that asked for it (RFC 8291 with the aes128gcm content coding of RFC 8188) and signed for the push service with
// VAPID (RFC 8292), so the push service only carries an opaque body. Only the browsers' own push services are
// reached, the same list the database accepts (laria_private.is_push_service_endpoint), and redirects are refused.

export type PushDevice = { id: string; endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url: string };
export type VapidKeys = { publicKey: string; privateKey: string; subject: string };
// sent: the push service took it. gone: the device no longer exists there (forget it). retry: try again later.
// failed: the push service refused this message or our signature.
export type PushSendResult = { status: "sent" | "gone" | "retry" | "failed"; code: string };
export type PushSender = { mode: "live" | "log"; send(device: PushDevice, message: PushMessage): Promise<PushSendResult> };

// A message waits a day at most for a phone that is off, and one Laria message replaces an older one still waiting.
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
export const PUSH_TOPIC = "laria-avisos";
const MAX_PAYLOAD_BYTES = 3000;
const RECORD_SIZE = 4096;
const PUSH_SERVICE = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/\S+$/;

export function isPushServiceEndpoint(endpoint: string) {
  return endpoint.length <= 1024 && PUSH_SERVICE.test(endpoint);
}

const decode = (value: string) => Buffer.from(value, "base64url");
const encode = (value: Uint8Array) => Buffer.from(value).toString("base64url");

// The message body for one browser: salt, record size and the one-time public key, then a single encrypted record.
// salt and serverPrivateKey are only passed by tests (the RFC 8291 example).
export function encryptPushPayload(payload: Uint8Array, device: Pick<PushDevice, "p256dh" | "auth">, options: { salt?: Buffer; serverPrivateKey?: Buffer } = {}) {
  const browserKey = decode(device.p256dh);
  const authSecret = decode(device.auth);
  if (browserKey.length !== 65 || browserKey[0] !== 4 || authSecret.length !== 16) throw new Error("PUSH_KEYS_INVALID");
  const server = createECDH("prime256v1");
  if (options.serverPrivateKey) server.setPrivateKey(options.serverPrivateKey);
  else server.generateKeys();
  const serverKey = server.getPublicKey();
  const sharedSecret = server.computeSecret(browserKey);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), browserKey, serverKey]);
  const inputKey = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const salt = options.salt ?? randomBytes(16);
  const contentKey = Buffer.from(hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", inputKey, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  // The 0x02 after the payload marks the last (and only) record; no padding.
  const record = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverKey.length, 20);
  return Buffer.concat([header, serverKey, record]);
}

const signingKeys = new Map<string, KeyObject>();

// "vapid t=<JWT>, k=<public key>": the push service checks it against the key the browser subscribed with.
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()) {
  const header = encode(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = encode(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;
  let key = signingKeys.get(keys.publicKey);
  if (!key) {
    const publicKey = decode(keys.publicKey);
    key = createPrivateKey({ key: { kty: "EC", crv: "P-256", d: keys.privateKey, x: encode(publicKey.subarray(1, 33)), y: encode(publicKey.subarray(33, 65)) }, format: "jwk" });
    signingKeys.set(keys.publicKey, key);
  }
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${encode(signature)}, k=${keys.publicKey}`;
}

// The VAPID pair from the environment, or null when neither half is set (local and preview builds). Half a pair,
// a pair that does not match or a subject that is not mailto: or https: is a configuration error.
export function readVapidKeys(env: Record<string, string | undefined> = process.env): VapidKeys | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  if (!publicKey && !privateKey) return null;
  const subject = env.VAPID_SUBJECT?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  const publicBytes = decode(publicKey);
  const privateBytes = decode(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32 || !/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) {
    throw new Error("PUSH_CONFIG_INVALID");
  }
  const pair = createECDH("prime256v1");
  try {
    pair.setPrivateKey(privateBytes);
  } catch {
    throw new Error("PUSH_CONFIG_INVALID");
  }
  if (!pair.getPublicKey().equals(publicBytes)) throw new Error("PUSH_CONFIG_INVALID");
  return { publicKey, privateKey, subject };
}

export async function sendWebPush(device: PushDevice, message: PushMessage, keys: VapidKeys, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<PushSendResult> {
  if (!isPushServiceEndpoint(device.endpoint)) return { status: "gone", code: "endpoint_unsupported" };
  const payload = Buffer.from(JSON.stringify(message));
  if (payload.length > MAX_PAYLOAD_BYTES) return { status: "failed", code: "payload_too_large" };
  let body: Buffer;
  try {
    body = encryptPushPayload(payload, device);
  } catch {
    return { status: "gone", code: "keys_invalid" };
  }
  let response: Response;
  try {
    response = await fetchImpl(device.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidAuthorization(device.endpoint, keys, now),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(PUSH_TTL_SECONDS),
        Urgency: "normal",
        Topic: PUSH_TOPIC,
      },
      body: new Uint8Array(body),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { status: "retry", code: "transport" };
  }
  const code = String(response.status);
  if (response.status >= 200 && response.status < 300) return { status: "sent", code };
  if (response.status === 404 || response.status === 410) return { status: "gone", code };
  if (response.status === 429 || response.status >= 500) return { status: "retry", code };
  return { status: "failed", code };
}

// Live with a VAPID pair; without one (local and preview builds) messages are only logged, as the e-mail log
// provider does.
export function createPushSender(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): PushSender {
  const keys = readVapidKeys(env);
  if (!keys) {
    return {
      mode: "log",
      async send(device, message) {
        console.info("push_log_provider", JSON.stringify({ device_id: device.id, title: message.title, url: message.url }));
        return { status: "sent", code: "logged" };
      },
    };
  }
  return { mode: "live", send: (device, message) => sendWebPush(device, message, keys, fetchImpl) };
}
