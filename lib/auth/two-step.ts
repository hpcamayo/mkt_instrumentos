import type { SupabaseClient } from "@supabase/supabase-js";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import type { Database } from "@/lib/supabase/database.types";

// safe-08 (accounts batch): the parts of lib/auth/mfa.ts that also run in middleware and in the browser.
//   aal1: the password, e-mail link or Google/Apple step only;  aal2: the authenticator code too.

export const SECURITY_PATH = "/mi-cuenta/seguridad";

export type Assurance = {
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  // A verified factor exists but this session has not used it yet.
  needsCode: boolean;
  hasFactor: boolean;
};

// Reads the levels from the session itself (no network call), so middleware can use it on every request.
export async function getAssurance(supabase: SupabaseClient<Database>): Promise<Assurance> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = data?.currentLevel === "aal2" ? "aal2" : data?.currentLevel === "aal1" ? "aal1" : null;
  const nextLevel = data?.nextLevel === "aal2" ? "aal2" : data?.nextLevel === "aal1" ? "aal1" : null;
  return {
    currentLevel,
    nextLevel,
    needsCode: currentLevel === "aal1" && nextLevel === "aal2",
    hasFactor: nextLevel === "aal2",
  };
}

export type TwoStepStep = "codigo" | "activar";

export function twoStepPath(step: TwoStepStep, next: string, reason?: "tienda" | "admin") {
  const params = new URLSearchParams({ paso: step, next: getSafeAuthRedirect(next) });
  if (reason) params.set("motivo", reason);
  return `${SECURITY_PATH}?${params.toString()}`;
}
