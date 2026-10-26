// Mi tienda helpers (Effortless Laria, batch "stores": shop-01, shop-03, list-12). Plain functions, so the form, the
// page and the tests agree.

export type StorePrefill = {
  name?: string;
  contact_person?: string;
  whatsapp_phone?: string;
  city?: string;
  region?: string;
};

type Metadata = Record<string, unknown> | undefined | null;
type ProfileLike = { full_name?: string | null; phone?: string | null; city?: string | null; region?: string | null } | null | undefined;

function readText(metadata: Metadata, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// shop-01: an invitation (app/api/admin/invite-user) carries the store's name, the person, WhatsApp, city and region,
// and the store-owner signup carries the person, WhatsApp, city and region. The application starts from them, so
// nobody types the same thing twice (WCAG 2.2, 3.3.7 Redundant Entry). The profile wins over the metadata because
// the person may have corrected it since.
export function storeApplicationPrefill(metadata: Metadata, profile: ProfileLike): StorePrefill {
  const prefill: StorePrefill = {
    name: readText(metadata, "store_name"),
    contact_person: profile?.full_name?.trim() || readText(metadata, "contact_person") || readText(metadata, "full_name"),
    whatsapp_phone: profile?.phone?.trim() || readText(metadata, "whatsapp") || readText(metadata, "phone"),
    city: profile?.city?.trim() || readText(metadata, "city"),
    region: profile?.region?.trim() || readText(metadata, "region"),
  };
  return Object.fromEntries(Object.entries(prefill).filter(([, value]) => value)) as StorePrefill;
}

export type SocialNetwork = "instagram_url" | "facebook_url" | "tiktok_url" | "website_url";

const SOCIAL_BASE: Record<Exclude<SocialNetwork, "website_url">, { host: string; prefix: string }> = {
  instagram_url: { host: "https://www.instagram.com/", prefix: "" },
  facebook_url: { host: "https://www.facebook.com/", prefix: "" },
  tiktok_url: { host: "https://www.tiktok.com/", prefix: "@" },
};

const HANDLE = /^@?[A-Za-z0-9._-]{1,60}$/;

// shop-03: a social field takes the handle ("@tutienda") or the link. A handle becomes the network's profile link; a
// link without a scheme gets https://. Anything else is left as typed, for the store page's existing http(s) check.
export function normalizeSocialInput(network: SocialNetwork, raw: string) {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (network !== "website_url" && HANDLE.test(value) && !/\.(com|pe|net|org)$/i.test(value)) {
    const base = SOCIAL_BASE[network];
    return `${base.host}${base.prefix}${value.replace(/^@/, "")}`;
  }
  if (/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
  return value;
}

export const SOCIAL_HINTS: Record<SocialNetwork, string> = {
  instagram_url: "Tu usuario (@tutienda) o el enlace.",
  facebook_url: "El nombre de tu página o el enlace.",
  tiktok_url: "Tu usuario (@tutienda) o el enlace.",
  website_url: "Por ejemplo: tutienda.pe",
};

// shop-03: what the public store page does with each image (components/store/store-header.tsx).
export const STORE_IMAGE_GUIDANCE = {
  logo: "Cuadrado, de al menos 400 × 400 px. Se ve en un cuadrado de 96 px en tu página y de 40 px en tus publicaciones. JPG, PNG o WebP, hasta 5 MB.",
  banner: "Horizontal, de al menos 1600 × 400 px. Se recorta como una franja de 120 px de alto; deja lo importante al centro. JPG, PNG o WebP, hasta 5 MB.",
} as const;

export const OPENING_HOURS_MAX = 300;

// Launch audit A09: the badge vouches for the business Laria checked. When the owner of a verified Tienda changes its
// public name, RUC or razón social, the badge waits for Admin to check again. Same rule as the database
// (protect_store_admin_fields): other spacing or capitals are not a change.
type StoreIdentity = { name?: string | null; ruc?: string | null; razon_social?: string | null };
const identityText = (value?: string | null) => (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const identityDigits = (value?: string | null) => (value ?? "").replace(/\D/g, "");

export function storeIdentityChanged(before: StoreIdentity, after: StoreIdentity) {
  return identityText(before.name) !== identityText(after.name)
    || identityDigits(before.ruc) !== identityDigits(after.ruc)
    || identityText(before.razon_social) !== identityText(after.razon_social);
}
