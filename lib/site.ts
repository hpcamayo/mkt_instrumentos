// Public site identity and canonical-URL helpers shared by metadata, robots and sitemap.
export const SITE_NAME = "Laria";
export const DEFAULT_SITE_URL = "https://laria.audio";
export const SITE_DESCRIPTION =
  "Marketplace peruano para comprar y vender instrumentos musicales usados y equipo de tiendas. Contacto directo por WhatsApp; Laria no procesa pagos ni envíos.";

export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Fall back to the production domain when the variable is malformed.
    }
  }
  return DEFAULT_SITE_URL;
}

export function absoluteUrl(path: string) {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

// Vercel preview/development deployments must never be indexed.
export function isIndexableDeployment() {
  const environment = process.env.VERCEL_ENV;
  return environment !== "preview" && environment !== "development";
}

export const SITE_OG_TITLE = "Laria | Instrumentos musicales en Perú";
export const SITE_OG_DESCRIPTION =
  "Compra y vende guitarras, bajos, baterías, pedales, amplificadores y equipos de audio en Perú. Contacto directo por WhatsApp.";

export const OPEN_GRAPH_BASE = { siteName: SITE_NAME, locale: "es_PE", type: "website" } as const;

export const NOINDEX_ROBOTS = { index: false, follow: false } as const;
export const NOINDEX_FOLLOW_ROBOTS = { index: false, follow: true } as const;

// Serialize JSON-LD safely for inline <script> tags.
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function truncateDescription(value: string, max = 158) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.6 ? cut.slice(0, boundary) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

// Private or utility route prefixes that must never be crawled or indexed.
export const NON_INDEXABLE_PATH_PREFIXES = [
  "/mi-cuenta",
  "/mis-publicaciones",
  "/admin",
  "/api",
  "/auth",
  "/login",
  "/logout",
  "/vender",
  "/publicar",
  "/registrar-tienda",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/confirmacion-correo",
  // Signup/onboarding flows, including their invitation sub-routes.
  "/registro/vendedor",
  "/registro/tienda",
] as const;
