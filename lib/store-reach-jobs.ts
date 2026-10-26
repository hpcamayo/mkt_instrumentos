import "server-only";

import { timingSafeEqual } from "node:crypto";

// Feature ideas, batch "store-reach": the batch's jobs (app/api/internal/jobs/*) answer only a scheduler that sends
// `Authorization: Bearer <CRON_SECRET>`, like the email worker. Without CRON_SECRET every call is refused.
export function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (!expected || authorization.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(authorization), Buffer.from(expected));
}
