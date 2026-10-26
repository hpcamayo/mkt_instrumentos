import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Submission = {
  id: string;
  kind: "listing" | "store" | "store_listing";
  ownerUserId?: string;
};

// Launch audit A35: draft and edit capabilities expire, and are signed with their own key. A submission lasts a week
// (a saved draft gets a fresh one when it is resumed, POST 02); an edit attempt lasts a day.
const SUBMISSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EDIT_LIFETIME_MS = 24 * 60 * 60 * 1000;

// SUBMISSION_TOKEN_SECRET when set; otherwise a key derived from the service role key, so a deployment needs no new
// setting and the service key itself never signs anything. Rotating either one only means a form that is open at that
// moment asks the person to start the upload again.
export function submissionTokenSecret() {
  const own = process.env.SUBMISSION_TOKEN_SECRET;
  if (own && own.length >= 32) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return null;
  return createHash("sha256").update(`laria-submission-tokens:${service}`).digest("hex");
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
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      !/^[0-9a-f-]{36}$/.test(value.id) ||
      !["listing", "store", "store_listing"].includes(value.kind) ||
      !Number.isFinite(value.exp) || value.exp <= now
    )
      return null;
    if (
      value.ownerUserId !== undefined &&
      !/^[0-9a-f-]{36}$/.test(value.ownerUserId)
    ) {
      return null;
    }
    return {
      id: value.id,
      kind: value.kind,
      ...(value.ownerUserId ? { ownerUserId: value.ownerUserId } : {}),
    };
  } catch {
    return null;
  }
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
