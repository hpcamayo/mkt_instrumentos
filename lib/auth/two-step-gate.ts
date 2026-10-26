import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAssurance, SECURITY_PATH, twoStepPath } from "@/lib/auth/two-step";
import type { Database } from "@/lib/supabase/database.types";

// safe-08 (accounts batch), used by middleware on account and Admin pages:
//   * an account with an authenticator app whose session skipped the code goes to the code step first;
//   * Mi tienda and Admin need the code once it is required (an approved payment method, or the Admin role), so an
//     account without the app is sent to set it up.
// API routes answer for themselves (the database refuses with TWO_STEP_REQUIRED), and Seguridad and sign-out stay open.

const GUARDED_PREFIXES = ["/mi-cuenta", "/mis-publicaciones", "/vender", "/admin"];
const REQUIREMENT_PREFIXES = ["/mi-cuenta/tienda", "/admin"];

function startsWithSegment(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export async function twoStepRedirectPath(
  supabase: SupabaseClient<Database>,
  request: NextRequest,
  claims: { aal?: unknown; app_metadata?: Record<string, unknown> } | null | undefined,
) {
  const { pathname, search } = request.nextUrl;
  if (!claims || claims.aal === "aal2") return null;
  if (!GUARDED_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix))) return null;
  if (startsWithSegment(pathname, SECURITY_PATH)) return null;
  const next = `${pathname}${search}`;
  const assurance = await getAssurance(supabase);
  if (assurance.needsCode) return twoStepPath("codigo", next);
  if (!REQUIREMENT_PREFIXES.some((prefix) => startsWithSegment(pathname, prefix))) return null;
  if (startsWithSegment(pathname, "/admin")) {
    return claims.app_metadata?.role === "admin" ? twoStepPath("activar", next, "admin") : null;
  }
  const { data } = await supabase.rpc("my_two_step_requirement");
  const required = typeof data === "object" && data !== null && !Array.isArray(data) && data.required === true;
  return required ? twoStepPath("activar", next, "tienda") : null;
}
