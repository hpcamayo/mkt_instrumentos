import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Submission = {
  id: string;
  kind: "listing" | "store" | "store_listing";
  ownerUserId?: string;
};

// `id` resumes an existing submission (a saved draft, POST 02); the route checks the draft belongs to the caller.
export function createSubmissionToken(
  kind: Submission["kind"],
  secret: string,
  ownerUserId?: string,
  id: string = randomUUID(),
) {
  const submission: Submission = {
    id,
    kind,
    ...(ownerUserId ? { ownerUserId } : {}),
  };
  const payload = Buffer.from(JSON.stringify(submission)).toString("base64url");
  return { ...submission, token: `${payload}.${sign(payload, secret)}` };
}

export function readSubmissionToken(
  token: string,
  secret: string,
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
      !["listing", "store", "store_listing"].includes(value.kind)
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

export function createListingEditToken(listingId: string, ownerUserId: string, secret: string) {
  const attemptId = randomUUID();
  const payload = Buffer.from(JSON.stringify({ listingId, ownerUserId, attemptId })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`listing-edit:${payload}`).digest("base64url");
  return { attemptId, token: `${payload}.${signature}` };
}

export function readListingEditToken(token: string, listingId: string, ownerUserId: string, secret: string) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(createHmac("sha256", secret).update(`listing-edit:${payload}`).digest("base64url"));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.listingId === listingId && value.ownerUserId === ownerUserId && /^[0-9a-f-]{36}$/.test(value.attemptId) ? value.attemptId as string : null;
  } catch { return null; }
}
