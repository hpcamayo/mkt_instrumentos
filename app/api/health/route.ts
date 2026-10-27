import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

// Server errors in the last 10 to 20 minutes from which the site counts as degraded.
const SERVER_ERROR_ALERT = 20;
const DATABASE_TIMEOUT_MS = 3_000;
// One database check per server instance every 15 seconds at most, however often the address is called.
const CHECK_REUSE_MS = 15_000;

type Health = { status: 200 | 503; body: { status: "ok" } | { status: "degraded"; reason: "database" | "errors" } };

let lastCheck: { at: number; health: Promise<Health> } | null = null;

// Launch audit A13: the uptime check (.github/workflows/uptime.yml) reads this every 10 minutes. 200 when the database
// answers within 3 seconds and fewer than 20 server errors arrived in the last 10 to 20 minutes (public.get_app_health),
// 503 otherwise, with the reason and nothing more: the answer is public.
export async function GET() {
  const now = Date.now();
  if (!lastCheck || now - lastCheck.at > CHECK_REUSE_MS) lastCheck = { at: now, health: checkHealth() };
  const { status, body } = await lastCheck.health;
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

async function checkHealth(): Promise<Health> {
  const degraded = (reason: "database" | "errors"): Health => ({ status: 503, body: { status: "degraded", reason } });
  const admin = getSupabaseAdminClient();
  if (!admin) return degraded("database");
  try {
    const { data, error } = await admin.rpc("get_app_health").abortSignal(AbortSignal.timeout(DATABASE_TIMEOUT_MS));
    const serverErrors = data && typeof data === "object" && !Array.isArray(data) ? (data as { server_errors?: unknown }).server_errors : null;
    if (error || typeof serverErrors !== "number") return degraded("database");
    return serverErrors >= SERVER_ERROR_ALERT ? degraded("errors") : { status: 200, body: { status: "ok" } };
  } catch {
    return degraded("database");
  }
}
