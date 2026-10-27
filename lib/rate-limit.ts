import "server-only";
import { createHash, createHmac } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// Launch audit A16 and A28: request limits per visitor for the server routes that call Supabase Auth (whose own
// limits count Vercel's address, shared by every visitor) or that say whether an e-mail has an account. Counted in
// the database (public.consume_rate_limit) under an HMAC of the visitor's address, so no address is stored.
export type RateLimitRule = { bucket: string; limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  // Sign-in through the API (scripts and tests; the login form signs in from the browser).
  login: { bucket: "auth.login", limit: 20, windowSeconds: 300 },
  // E-mail links: confirmation, magic link, recovery. A person opens a few; a flood of made-up links stops here, well
  // before it uses up Supabase's 30 checks per address every 5 minutes, which count the server's address unless
  // the visitor's is forwarded (lib/supabase/visitor-auth.ts).
  callback: { bucket: "auth.callback", limit: 10, windowSeconds: 600 },
  // The sign-up forms check the address before creating the account.
  checkEmail: { bucket: "auth.check_email", limit: 20, windowSeconds: 600 },
  resendConfirmation: { bucket: "auth.resend", limit: 6, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

// Vercel sets both headers to the visitor's address and overwrites whatever a client sends.
export function clientAddress(request: Request) {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export type RateLimitVerdict = "allowed" | "limited" | "unavailable";

// "limited" once the visitor is over the limit. Until the migration that adds the counter is applied (PostgREST can't
// find consume_rate_limit), every request is allowed, as before A16. Any other failure is "unavailable", logged, and
// each route decides: the e-mail check then refuses to answer, since it would otherwise say whether an address has an
// account with no limit at all; the routes that call Supabase Auth go on (allowRequest), under Supabase's own limits.
export async function checkRequest(rule: RateLimitRule, request: Request): Promise<RateLimitVerdict> {
  const admin = getSupabaseAdminClient();
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!admin || !secret) return "unavailable";
  const key = createHmac("sha256", createHash("sha256").update(`laria-rate-limit:${secret}`).digest())
    .update(clientAddress(request))
    .digest("hex");
  const { data, error } = await admin.rpc("consume_rate_limit", {
    p_bucket: rule.bucket,
    p_key: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (!error && typeof data === "boolean") return data ? "allowed" : "limited";
  console.warn("rate-limit-unavailable", rule.bucket, error ? error.code ?? error.message : "unexpected answer");
  return error?.code === "PGRST202" ? "allowed" : "unavailable";
}

// True unless the visitor is over the limit: a counter that can't count never blocks a sign-in or an e-mail link.
export async function allowRequest(rule: RateLimitRule, request: Request) {
  return (await checkRequest(rule, request)) !== "limited";
}
