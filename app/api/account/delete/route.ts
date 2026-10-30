import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { accountClient, accountError, NO_STORE } from "@/lib/account/route-helpers";
import { DEVICE_COOKIE } from "@/lib/auth/devices";
import { REMEMBER_COOKIE } from "@/lib/auth/remember";
import { PUSH_DEVICE_COOKIE } from "@/lib/push/device";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import type { Database } from "@/lib/supabase/database";

type DeletionCheck = { allowed?: boolean; blocker?: string | null; has_password?: boolean };

// safe-09 (accounts batch): "Eliminar mi cuenta". The person confirms with their password (or, for an account that only
// uses Google or Apple, by typing its e-mail). Listings leave the site, personal data is removed, and verified purchases
// and sales stay under "Cuenta eliminada" (A20's laria_private.anonymize_account, which clears this branch's tables
// too; files it no longer needs, such as stolen-gear photos, go with the daily uploads sweep). The Supabase Auth user is
// then soft-deleted, which ends every session.
export async function POST(request: Request) {
  const client = await accountClient(request, { secondStep: true });
  if ("response" in client) return client.response;
  const { supabase, user } = client;
  const admin = getSupabaseAdminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!admin || !supabaseUrl || !supabaseAnonKey || !user.email) {
    return accountError("No podemos eliminar cuentas en este momento. Escríbenos desde el Centro de ayuda.", 503);
  }

  const { data: checkData, error: checkError } = await supabase.rpc("my_account_deletion_check");
  const check = (checkData ?? {}) as DeletionCheck;
  if (checkError) return accountError("No pudimos revisar tu cuenta. Vuelve a intentarlo.", 503);
  if (!check.allowed) return accountError(blockerMessage(check.blocker), 409, "DELETE_BLOCKED");

  const body = (await request.json().catch(() => null)) as { password?: unknown; email?: unknown } | null;
  if (check.has_password) {
    const password = typeof body?.password === "string" ? body.password : "";
    if (!password) return accountError("Escribe tu contraseña.", 400);
    // A separate client that keeps nothing: it only checks the password and closes its own session again.
    const verifier = createClient<Database>(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await verifier.auth.signInWithPassword({ email: user.email, password });
    if (error) {
      return error.status === 429
        ? accountError("Hiciste muchos intentos. Espera unos minutos y vuelve a intentarlo.", 429)
        : accountError("La contraseña no coincide.", 401);
    }
    await verifier.auth.signOut({ scope: "local" });
  } else {
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email !== user.email.toLowerCase()) return accountError("Escribe el correo de tu cuenta tal como aparece arriba.", 400);
  }

  const { error } = await admin.rpc("service_delete_account", { p_user_id: user.id });
  if (error?.message?.includes("DELETE_BLOCKED_")) {
    return accountError(blockerMessage(error.message.includes("ADMIN") ? "admin" : "store"), 409, "DELETE_BLOCKED");
  }
  if (error) return accountError("No pudimos eliminar tu cuenta. Vuelve a intentarlo.", 503);

  await supabase.auth.signOut({ scope: "local" });
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) {
    // The data is already gone; Admin can finish removing the sign-in by hand.
    console.error("account_delete_auth_failure", deleteError.code ?? "auth_error");
  }

  const response = NextResponse.json({ ok: true, redirect: "/login?motivo=cuenta-eliminada" }, { headers: NO_STORE });
  response.cookies.delete(REMEMBER_COOKIE);
  response.cookies.delete(PUSH_DEVICE_COOKIE);
  response.cookies.delete(DEVICE_COOKIE);
  return response;
}

function blockerMessage(blocker: string | null | undefined) {
  return blocker === "admin"
    ? "Las cuentas de Admin no se eliminan desde aquí. Pide a otra persona del equipo que retire tu acceso."
    : "Primero hay que cerrar tu tienda. Escríbenos desde el Centro de ayuda y la cerramos contigo.";
}
