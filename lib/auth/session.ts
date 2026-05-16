import { redirect } from "next/navigation";
import { getSafeAuthRedirect } from "@/lib/auth/redirects";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export async function getCurrentSession() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user;
}

export async function requireUser(nextPath?: string) {
  const user = await getCurrentUser();

  if (!user) {
    const next = getSafeAuthRedirect(nextPath, "/mi-cuenta");
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return user;
}
