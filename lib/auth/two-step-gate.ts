import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssurance, SECURITY_PATH, twoStepPath } from "@/lib/auth/two-step";
import type { Database } from "@/lib/supabase/database";

// safe-08 (accounts batch), used by middleware on account and Admin pages:
//   * an Admin session that skipped its authenticator code goes to the code step first;
//   * Admin without an app is sent to set it up. Other accounts use ordinary sign-in during the pilot.
// API routes answer for themselves (the database refuses with TWO_STEP_REQUIRED), and Seguridad and sign-out stay open.

const GUARDED_PREFIXES = ["/mi-cuenta", "/mis-publicaciones", "/vender", "/admin"];

function startsWithSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function twoStepRedirectPath(
  supabase: SupabaseClient<Database>,
  request: NextRequest,
  claims: { aal?: unknown; app_metadata?: Record<string, unknown> } | null | undefined,
) {
  const { pathname, search } = request.nextUrl;
  if (!claims || claims.app_metadata?.role !== "admin" || claims.aal === "aal2") return null;
  if (!GUARDED_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix))) return null;
  if (startsWithSegment(pathname, SECURITY_PATH)) return null;
  const next = `${pathname}${search}`;
  const assurance = await getAssurance(supabase);
  if (assurance.needsCode) return twoStepPath("codigo", next);
  if (!startsWithSegment(pathname, "/admin")) return null;
  return twoStepPath("activar", next, "admin");
}
