import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const INDIVIDUAL_SELLER_ACCOUNT_TYPE = "seller";
export const STORE_OWNER_ACCOUNT_TYPE = "store_owner";

export type SellerProfileInput = {
  fullName: string;
  phone: string;
  city: string;
  region: string;
};

type ProfileResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

export async function upsertSellerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SellerProfileInput,
): Promise<ProfileResult> {
  const { data: currentProfile, error: profileError } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      message: "No se pudo revisar tu perfil. Intenta nuevamente.",
    };
  }

  if (
    currentProfile?.account_type &&
    currentProfile.account_type !== INDIVIDUAL_SELLER_ACCOUNT_TYPE
  ) {
    return {
      ok: false,
      message: "Esta cuenta ya esta registrada con otro tipo de perfil.",
    };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE,
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      city: input.city.trim(),
      region: input.region.trim(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return {
      ok: false,
      message: "No se pudo guardar tu perfil. Intenta nuevamente.",
    };
  }

  return { ok: true };
}

export async function upsertStoreOwnerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SellerProfileInput,
): Promise<ProfileResult> {
  const { data: currentProfile, error: profileError } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      message: "No se pudo revisar tu perfil. Intenta nuevamente.",
    };
  }

  if (
    currentProfile?.account_type &&
    currentProfile.account_type !== STORE_OWNER_ACCOUNT_TYPE
  ) {
    return {
      ok: false,
      message:
        "Esta cuenta no esta marcada como tienda. Revisa que hayas abierto el enlace de invitacion correcto.",
    };
  }

  const { error } = await supabase.from("profiles").upsert(
    {
      id: userId,
      account_type: STORE_OWNER_ACCOUNT_TYPE,
      full_name: input.fullName.trim(),
      phone: input.phone.trim(),
      city: input.city.trim(),
      region: input.region.trim(),
    },
    { onConflict: "id" },
  );

  if (error) {
    return {
      ok: false,
      message: "No se pudo guardar tu perfil. Intenta nuevamente.",
    };
  }

  return { ok: true };
}
