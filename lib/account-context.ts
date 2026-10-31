import { cache } from "react";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const getAccountContext = cache(async function getAccountContext() {
  const user = await requireUser("/mi-cuenta");
  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase
        .from("profiles")
        .select("full_name,phone,city,region,account_type")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const { data: store } =
    supabase && profile?.account_type === "store_owner"
      ? await supabase
          // The owner's private fields (RUC, e-mail, address...) are not readable through the stores table.
          .rpc("get_own_store")
          .select(
            "id,name,slug,status,is_verified,rejection_reason,razon_social,ruc,email,contact_person,whatsapp_phone,city,region,district,address,description,instagram_url,facebook_url,tiktok_url,website_url,logo_url,banner_url,show_address,opening_hours,verification_lapsed_at,map_latitude,map_longitude",
          )
          .maybeSingle()
      : { data: null };

  return { user, profile, store, supabase };
});

