import { NextResponse } from "next/server";
import { accountClient, accountError, NO_STORE } from "@/lib/account/route-helpers";
import { REMEMBER_COOKIE } from "@/lib/auth/remember";
import { PUSH_DEVICE_COOKIE } from "@/lib/push/device";

// safe-08 (accounts batch): "Cerrar sesión en todos los dispositivos". Every browser except this one is forgotten
// (signing in there again sends the new-device e-mail and asks for the code), push notices stop on every device, and
// Supabase ends every session of the account, this one included.
export async function POST(request: Request) {
  const client = await accountClient(request, { secondStep: true });
  if ("response" in client) return client.response;
  const { error } = await client.supabase.rpc("prepare_sign_out_everywhere");
  if (error) return accountError("No pudimos cerrar las sesiones. Vuelve a intentarlo.", 503);
  const { error: signOutError } = await client.supabase.auth.signOut({ scope: "global" });
  if (signOutError) return accountError("No pudimos cerrar las sesiones. Vuelve a intentarlo.", 503);
  const response = NextResponse.json({ ok: true, redirect: "/login?motivo=sesiones" }, { headers: NO_STORE });
  response.cookies.delete(REMEMBER_COOKIE);
  response.cookies.delete(PUSH_DEVICE_COOKIE);
  return response;
}
