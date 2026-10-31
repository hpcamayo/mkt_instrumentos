import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { HELP_TICKET_TOPICS } from "@/lib/help/articles";
import { sessionOwesTwoStep } from "@/lib/auth/complete-session";
import { clientAddress } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const NO_STORE = { "Cache-Control": "private, no-store" };

// safe-10 (accounts batch): "¿No encontraste tu respuesta?" from the help center, signed in or not. The database keeps
// light abuse limits (per e-mail, per account and per browser); the browser is a keyed hash of its address, never the
// address itself.
export async function POST(request: NextRequest) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud no permitida.", 403);
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No pudimos enviar tu consulta. Vuelve a intentarlo.", 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (key: string, max: number) => (typeof body?.[key] === "string" ? (body[key] as string).trim().slice(0, max) : "");
  const topic = text("topic", 20);
  const pagePath = text("page_path", 300);
  if (!HELP_TICKET_TOPICS.some((item) => item.id === topic)) return failure("Elige un tema.", 400);

  const admin = getSupabaseAdminClient();
  const hash = clientHash(request);
  if (!admin || !hash) return failure("No pudimos enviar tu consulta. Vuelve a intentarlo.", 503);
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user && await sessionOwesTwoStep(supabase)) return failure("Ingresa el código de tu app de autenticación para continuar.", 403);
  const { data, error } = await admin.rpc("service_submit_help_ticket", {
    p_user_id: auth.user?.id,
    p_name: text("name", 120),
    p_email: text("email", 254) || null,
    p_topic: topic,
    p_message: text("message", 3000),
    p_page_path: /^\/[A-Za-z0-9/_.?=&%-]*$/.test(pagePath) ? pagePath : null,
    p_client_hash: hash,
  });
  if (error?.message.includes("HELP_TICKET_RATE_LIMITED")) {
    return failure("Ya recibimos varias consultas tuyas hoy y las responderemos por correo. Si necesitas contarnos otra cosa, vuelve a intentarlo mañana.", 429);
  }
  if (error?.message.includes("HELP_TICKET_INVALID")) return failure("Revisa tu nombre, tu correo y tu consulta.", 400);
  const code = typeof data === "object" && data !== null && !Array.isArray(data) && typeof data.code === "string" ? data.code : null;
  if (error || !code) return failure("No pudimos enviar tu consulta. Vuelve a intentarlo.", 503);
  return NextResponse.json({ code }, { headers: NO_STORE });
}

function clientHash(request: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const address = clientAddress(request);
  if (!key) return null;
  return createHmac("sha256", key).update(`help-ticket:${address}`).digest("hex");
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: NO_STORE });
}
