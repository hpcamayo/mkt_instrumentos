import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// The pilot is Admin-only. Supabase Auth still requires aal2 for password/email changes when a non-Admin has an
// older factor, even if the app no longer prompts. Retire those factors at sign-in and on Seguridad. Callers pass
// only a user verified by Auth.getUser; Admin factors are never removed here.
export async function retirePilotNonAdminFactors(user: User) {
  if (user.app_metadata?.role === "admin" || !user.factors?.length) return;
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Pilot authenticator cleanup is unavailable");
  for (const factor of user.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id });
    if (error && error.status !== 404) throw new Error("Pilot authenticator cleanup failed");
  }
}
