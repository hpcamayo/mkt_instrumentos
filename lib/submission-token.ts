import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Submission = {
  id: string;
  kind: "listing" | "store" | "store_listing";
  ownerUserId?: string;
};

// Launch audit A35: draft and edit capabilities expire, and are signed with their own key. A submission lasts a week
// (a draft saved to the account gets a fresh one when it is resumed, POST 02, and one kept on a device renews its own);
// an edit attempt lasts a day.
const SUBMISSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EDIT_LIFETIME_MS = 24 * 60 * 60 * 1000;

// SUBMISSION_TOKEN_SECRET when set; otherwise a key derived from the service role key, so a deployment needs no new
// setting and the service key itself never signs anything. Setting SUBMISSION_TOKEN_SECRET later breaks nothing (a
// draft's token is renewed with the old key); rotating the key a token was signed with means that draft's photos have
// to be added again.
export function submissionTokenSecret() {
  const own = process.env.SUBMISSION_TOKEN_SECRET;
  if (own && own.length >= 32) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return service ? derivedKey(service) : null;
}

function derivedKey(service: string) {
  return createHash("sha256").update(`laria-submission-tokens:${service}`).digest("hex");
}

// Every key a submission token may have been signed with: the current one, the derived one (before
// SUBMISSION_TOKEN_SECRET was set) and, for tokens from before expiry existed, the service role key itself. Only
// renewal reads tokens with these (readRenewableSubmissionToken).
export function submissionRenewalKeys() {
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keys = [submissionTokenSecret(), service && derivedKey(service), service];
  return [...new Set(keys.filter((key): key is string => Boolean(key)))];
}

// `id` resumes an existing submission (a saved draft, POST 02); the route checks the draft belongs to the caller.
export function createSubmissionToken(
  kind: Submission["kind"],
  secret: string,
  ownerUserId?: string,
  id: string = randomUUID(),
  now = Date.now(),
) {
  const submission: Submission = {
    id,
    kind,
    ...(ownerUserId ? { ownerUserId } : {}),
  };
  const payload = Buffer.from(JSON.stringify({ ...submission, exp: now + SUBMISSION_LIFETIME_MS })).toString("base64url");
  return { ...submission, token: `${payload}.${sign(payload, secret)}` };
}

export function readSubmissionToken(
  token: string,
  secret: string,
  now = Date.now(),
): Submission | null {
  const value = readSigned(token, [secret]);
  return value && Number.isFinite(value.exp) && (value.exp as number) > now ? submissionOf(value) : null;
}

// A draft kept on a device holds the token it started with, which may have expired or predate expiry. Its owner trades
// it for a fresh one for the same submission (the "renew" action), so the photos already in its folder carry over:
// expiry is ignored, an owner is required, and the route checks the owner is the caller.
export function readRenewableSubmissionToken(token: string, keys: string[]) {
  const value = readSigned(token, keys);
  return value?.ownerUserId ? (submissionOf(value) as Required<Submission>) : null;
}

function readSigned(token: string, keys: string[]) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const actual = Buffer.from(signature);
    const signed = keys.some((key) => {
      const expected = Buffer.from(sign(payload, key));
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    });
    if (!signed) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !/^[0-9a-f-]{36}$/.test(value.id) ||
      !["listing", "store", "store_listing"].includes(value.kind)
    )
      return null;
    if (
      value.ownerUserId !== undefined &&
      !/^[0-9a-f-]{36}$/.test(value.ownerUserId)
    ) {
      return null;
    }
    return value as Submission & { exp?: number };
  } catch {
    return null;
  }
}

function submissionOf({ id, kind, ownerUserId }: Submission): Submission {
  return { id, kind, ...(ownerUserId ? { ownerUserId } : {}) };
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`marketplace-submission:${payload}`)
    .digest("base64url");
}

export function createListingEditToken(listingId: string, ownerUserId: string, secret: string, now = Date.now()) {
  const attemptId = randomUUID();
  const payload = Buffer.from(JSON.stringify({ listingId, ownerUserId, attemptId, exp: now + EDIT_LIFETIME_MS })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`listing-edit:${payload}`).digest("base64url");
  return { attemptId, token: `${payload}.${signature}` };
}

export function readListingEditToken(token: string, listingId: string, ownerUserId: string, secret: string, now = Date.now()) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(createHmac("sha256", secret).update(`listing-edit:${payload}`).digest("base64url"));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.listingId === listingId && value.ownerUserId === ownerUserId && /^[0-9a-f-]{36}$/.test(value.attemptId)
      && Number.isFinite(value.exp) && value.exp > now ? value.attemptId as string : null;
  } catch { return null; }
}
