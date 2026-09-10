import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePeruRegion } from "@/lib/location";
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

export type NormalizedSellerProfile = {
  fullName: string;
  phone: string;
  city: string;
  region: string;
};

type ProfileValidationResult =
  | { ok: true; profile: NormalizedSellerProfile }
  | { ok: false; message: string };

export function validateSellerProfileInput(
  input: SellerProfileInput,
): ProfileValidationResult {
  const fullName = input.fullName.trim();
  if (!fullName) {
    return { ok: false, message: "Ingresa tu nombre completo." };
  }

  const phone = normalizeProfilePhone(input.phone);
  if (!phone) {
    return { ok: false, message: "Ingresa un WhatsApp válido." };
  }

  const location = validateProfileLocation(input.city, input.region);
  if (!location.ok) return location;

  return {
    ok: true,
    profile: {
      fullName,
      phone,
      city: location.city,
      region: location.region,
    },
  };
}

export function isSellerProfileComplete(
  profile:
    | Pick<Database["public"]["Tables"]["profiles"]["Row"], "full_name" | "phone" | "city" | "region">
    | null
    | undefined,
) {
  if (!profile) return false;
  return validateSellerProfileInput({
    fullName: profile.full_name ?? "",
    phone: profile.phone ?? "",
    city: profile.city ?? "",
    region: profile.region ?? "",
  }).ok;
}

export async function upsertSellerProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: SellerProfileInput,
): Promise<ProfileResult> {
  const validated = validateSellerProfileInput(input);
  if (!validated.ok) return validated;
  const normalized = validated.profile;

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
      full_name: normalized.fullName,
      phone: normalized.phone,
      city: normalized.city,
      region: normalized.region,
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
  const validated = validateSellerProfileInput(input);
  if (!validated.ok) return validated;
  const normalized = validated.profile;

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
      full_name: normalized.fullName,
      phone: normalized.phone,
      city: normalized.city,
      region: normalized.region,
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

export function normalizeProfilePhone(value: string) {
  const phone = value.replace(/\D/g, "");
  return /^\d{9,15}$/.test(phone) ? phone : null;
}

function validateProfileLocation(city: string, region: string) {
  const trimmedCity = city.trim();
  const normalizedRegion = normalizePeruRegion(region);

  if (!trimmedCity) {
    return {
      ok: false as const,
      message: "Ingresa una ciudad valida.",
    };
  }

  if (!normalizedRegion) {
    return {
      ok: false as const,
      message: "Selecciona una region valida de Peru.",
    };
  }

  return {
    ok: true as const,
    city: trimmedCity,
    region: normalizedRegion,
  };
}
