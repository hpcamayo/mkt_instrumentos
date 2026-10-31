import type { NextRequest } from "next/server";
import { accountClient, accountError, accountJson } from "@/lib/account/route-helpers";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// safe-09 (accounts batch): change the sign-in e-mail from Seguridad. Supabase sends the confirmation link (to the new
// address, and to the current one too when "Secure email change" is on); the account keeps the old address until then.
export async function POST(request: NextRequest) {
  const client = await accountClient(request, { secondStep: true });
  if ("response" in client) return client.response;
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 254) return accountError("Escribe un correo válido.", 400);
  if (email === client.user.email?.toLowerCase()) return accountError("Ese ya es tu correo de acceso.", 400);
  const next = "/mi-cuenta/seguridad?correo=confirmado";
  const { error } = await client.supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${request.nextUrl.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  );
  if (error?.status === 429) return accountError("Pediste varios cambios seguidos. Espera unos minutos y vuelve a intentarlo.", 429);
  if (error?.code === "email_exists" || error?.status === 422) {
    return accountError("No podemos usar ese correo. Si ya tiene una cuenta en Laria, elige otro.", 409);
  }
  if (error) return accountError("No pudimos pedir el cambio. Vuelve a intentarlo.", 503);
  return accountJson({ ok: true, email });
}
