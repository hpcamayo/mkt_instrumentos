import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type Submission = {
  id: string;
  kind: "listing" | "store";
  ownerUserId?: string;
};

export function createSubmissionToken(
  kind: Submission["kind"],
  secret: string,
  ownerUserId?: string,
) {
  const submission: Submission = {
    id: randomUUID(),
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
      !["listing", "store"].includes(value.kind)
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
