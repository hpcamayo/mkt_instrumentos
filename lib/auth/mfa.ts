import { redirect } from "next/navigation";
import { getAssurance, twoStepPath } from "@/lib/auth/two-step";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// During the pilot, only Admin uses two-step sign-in (launch audit A15). Store owners, Particulars and service
// providers do not enroll or receive a code prompt. Re-enabling it for other accounts needs a new release decision.
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
