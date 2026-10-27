import { accountClient, accountError, accountJson } from "@/lib/account/route-helpers";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// safe-08 (accounts batch): a recovery code instead of the authenticator app. The database spends the code (five tries
// in fifteen minutes, then an e-mail to the account); the authenticator app is then removed with the service role,
// so the person can enter and set it up again.
export async function POST(request: Request) {
  const client = await accountClient(request);
  if ("response" in client) return client.response;
  const admin = getSupabaseAdminClient();
  if (!admin) return accountError("La recuperación no está disponible en este momento.", 503);
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.slice(0, 32) : "";
  const { data, error } = await client.supabase.rpc("use_my_recovery_code", { p_code: code });
  if (error?.message?.includes("RECOVERY_RATE_LIMITED")) {
    return accountError("Hiciste muchos intentos. Espera 15 minutos y vuelve a intentarlo.", 429);
  }
  if (error) return accountError("No pudimos revisar el código. Vuelve a intentarlo.", 503);
  if (data !== true) return accountError("Ese código no es válido o ya se usó.", 400);
  const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: client.user.id });
  if (listError) return accountError("No pudimos desactivar la app. Escríbenos desde el Centro de ayuda.", 503);
  for (const factor of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId: client.user.id, id: factor.id });
  }
  return accountJson({ ok: true });
}
