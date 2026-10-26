import { redirect } from "next/navigation";
import { getAssurance, twoStepPath } from "@/lib/auth/two-step";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// Two-step sign-in (an authenticator-app code) for every account that turns it on, required for Admin (launch audit
// A15) and for a store owner once the store has an approved payment method (safe-08, accounts batch).
// The code step and the setup live on /mi-cuenta/seguridad (components/auth/two-step-setup.tsx). A session keeps its
// level while it lasts, so with "Mantener sesión iniciada" the code is asked only on a new device or after signing out.
// The pure helpers live in lib/auth/two-step.ts so middleware and the browser can use them too.

export { getAssurance, SECURITY_PATH, twoStepPath, type Assurance, type TwoStepStep } from "@/lib/auth/two-step";

// For server pages that need a second-factor session: sends the person to the code step, or to set it up first.
export async function requireAal2(next: string) {
  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect(twoStepPath("activar", next));
  const assurance = await getAssurance(supabase);
  if (assurance.currentLevel === "aal2") return;
  redirect(twoStepPath(assurance.needsCode ? "codigo" : "activar", next));
}
