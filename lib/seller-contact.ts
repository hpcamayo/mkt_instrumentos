import { normalizePeruPhone } from "@/lib/phone";

type SellerProfile = {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  region: string;
  created_at: string;
};

type ContactStore = { whatsapp_phone?: string | null };

type SellerContactListing = {
  seller_type: "individual" | "store";
  owner_user_id: string | null;
  profiles: SellerProfile | SellerProfile[] | null;
  contact_name: string | null;
  whatsapp_phone: string;
  city: string;
  region: string;
  created_at: string;
  stores?: ContactStore | ContactStore[] | null;
};

export function resolveParticularSeller(listing: SellerContactListing) {
  const profile = Array.isArray(listing.profiles)
    ? listing.profiles[0] ?? null
    : listing.profiles;
  const usesProfile =
    listing.seller_type === "individual" &&
    Boolean(listing.owner_user_id && profile);

  return {
    usesProfile,
    name: usesProfile ? profile?.full_name : listing.contact_name,
    phone: usesProfile ? profile?.phone : listing.whatsapp_phone,
    city: usesProfile ? profile?.city : listing.city,
    region: usesProfile ? profile?.region : listing.region,
    createdAt: usesProfile ? profile?.created_at : listing.created_at,
  };
}

// The number a listing's WhatsApp button opens (fix-03): a store listing uses the store's current number, the way an
// account-owned Particular listing uses the current profile; the listing's own copy is only the fallback (legacy rows,
// or a store row the query did not embed).
export function resolveContactPhone(listing: SellerContactListing) {
  if (listing.seller_type === "store") {
    const store = Array.isArray(listing.stores) ? listing.stores[0] ?? null : listing.stores ?? null;
    if (store?.whatsapp_phone && store.whatsapp_phone.replace(/\D/g, "")) return store.whatsapp_phone;
    return listing.whatsapp_phone;
  }
  return resolveParticularSeller(listing).phone ?? listing.whatsapp_phone;
}

// wa.me needs the country code: the one +51 rule (lib/phone.ts, accounts' fix-01) adds 51 to a bare 9-digit Peruvian
// mobile and drops a leading 00; anything else is kept as typed.
export function whatsAppNumber(raw: string | null | undefined) {
  return normalizePeruPhone(raw);
}

export function whatsAppUrl(phone: string | null | undefined, message: string) {
  return `https://wa.me/${whatsAppNumber(phone)}?text=${encodeURIComponent(message)}`;
}
