import { NextResponse } from "next/server";
import { readEmailLinkToken } from "@/lib/email/links";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

// save-07: one-click unsubscribe. Mail providers POST here with "List-Unsubscribe=One-Click" (RFC 8058); the
// confirmation page posts its form here too and is sent back with the result. A GET never changes anything, because
// link scanners open links in e-mails: it shows the confirmation page instead.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const token = url.searchParams.get("token") ?? (typeof form?.get("token") === "string" ? String(form.get("token")) : null);
  const fromPage = form?.get("desde") === "pagina";
  const payload = readEmailLinkToken(token);
  const client = getSupabaseAdminClient();
  let ok = false;
  if (payload && client) {
    const { data, error } = await client.rpc("apply_email_link_action", { p_user_id: payload.user, p_action: payload.action, ...(payload.alert ? { p_alert_id: payload.alert } : {}) });
    ok = !error && data !== false;
  }
  if (fromPage) {
    const back = new URL("/correos/baja", url.origin);
    back.searchParams.set(ok ? "hecho" : "error", payload?.action ?? "enlace");
    return NextResponse.redirect(back, { status: 303 });
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : payload ? 503 : 400, headers: { "Cache-Control": "no-store" } });
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const page = new URL("/correos/baja", url.origin);
  const token = url.searchParams.get("token");
  if (token) page.searchParams.set("token", token);
  return NextResponse.redirect(page, { status: 303 });
}
