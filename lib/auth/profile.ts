import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePeruRegion } from "@/lib/location";
import { isValidWhatsAppPhone, normalizePeruPhone } from "@/lib/phone";
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

// auth-02: a new Particular gives only a name. WhatsApp and city are asked when they are first needed (publishing),
// so a buyer who only wants to save a guitar never types them. The profile row is created with the name alone.
export async function upsertBasicSellerProfile(supabase: SupabaseClient<Database>, userId: string, fullName: string): Promise<ProfileResult> {
  const name = fullName.trim();
  if (!name) return { ok: false, message: "Ingresa tu nombre completo." };
  const { data: current, error: readError } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
  if (readError) return { ok: false, message: "No se pudo revisar tu perfil. Intenta nuevamente." };
  if (current) return { ok: true };
  const { error } = await supabase.from("profiles").insert({ id: userId, account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE, full_name: name });
  return error ? { ok: false, message: "No se pudo guardar tu perfil. Intenta nuevamente." } : { ok: true };
}

// auth-02: the profile page lets a Particular leave WhatsApp and city empty until they publish.
export async function saveOptionalSellerProfile(supabase: SupabaseClient<Database>, userId: string, input: SellerProfileInput): Promise<ProfileResult> {
  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, message: "Ingresa tu nombre completo." };
  const phone = input.phone.trim() ? normalizeProfilePhone(input.phone) : null;
  if (input.phone.trim() && !phone) return { ok: false, message: "Ingresa un WhatsApp válido." };
  const city = input.city.trim() || null;
  const region = normalizePeruRegion(input.region);
  if (city && !region) return { ok: false, message: "Selecciona una región válida de Perú." };
  const { data: current, error: readError } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
  if (readError) return { ok: false, message: "No se pudo revisar tu perfil. Intenta nuevamente." };
  if (current?.account_type && current.account_type !== INDIVIDUAL_SELLER_ACCOUNT_TYPE) return { ok: false, message: "Esta cuenta ya está registrada con otro tipo de perfil." };
  const { error } = await supabase.from("profiles").upsert(
    { id: userId, account_type: INDIVIDUAL_SELLER_ACCOUNT_TYPE, full_name: fullName, phone, city, ...(region ? { region } : {}) },
    { onConflict: "id" },
  );
  return error ? { ok: false, message: "No se pudo guardar tu perfil. Intenta nuevamente." } : { ok: true };
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
      message: "Esta cuenta ya está registrada con otro tipo de perfil.",
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
        "Esta cuenta no está registrada como Tienda. Revisa que hayas abierto el enlace de invitación correcto.",
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

// Digits with the country code ("51987654321"), or null when WhatsApp could not open it (fix-01).
export function normalizeProfilePhone(value: string) {
  const phone = normalizePeruPhone(value);
  return isValidWhatsAppPhone(phone) ? phone : null;
}

function validateProfileLocation(city: string, region: string) {
  const trimmedCity = city.trim();
  const normalizedRegion = normalizePeruRegion(region);

  if (!trimmedCity) {
    return {
      ok: false as const,
      message: "Ingresa una ciudad válida.",
    };
  }

  if (!normalizedRegion) {
    return {
      ok: false as const,
      message: "Selecciona una región válida de Perú.",
    };
  }

  return {
    ok: true as const,
    city: trimmedCity,
    region: normalizedRegion,
  };
}
