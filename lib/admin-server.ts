import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { parseAdminCounts } from "@/lib/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const requireAdmin = cache(async function requireAdmin(nextPath = "/admin") {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const supabase = await getSupabaseServerClient();
  if (!supabase) redirect("/");

  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  if (error || isAdmin !== true) redirect("/mi-cuenta?admin=denied");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile, supabase };
});

export const getAdminCounts = cache(async function getAdminCounts() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("get_admin_moderation_counts");
  if (error) return null;
  return parseAdminCounts(data);
});
