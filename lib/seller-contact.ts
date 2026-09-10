type SellerProfile = {
  full_name: string | null;
  phone: string | null;
  city: string | null;
  region: string;
  created_at: string;
};

type SellerContactListing = {
  seller_type: "individual" | "store";
  owner_user_id: string | null;
  profiles: SellerProfile | SellerProfile[] | null;
  contact_name: string | null;
  whatsapp_phone: string;
  city: string;
  region: string;
  created_at: string;
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
