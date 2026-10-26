import type { Metadata } from "next";
import { DEFAULT_OG_IMAGES, NOINDEX_FOLLOW_ROBOTS, OPEN_GRAPH_BASE, SITE_NAME, truncateDescription } from "@/lib/site";
import {
  SERVICE_CATEGORY_INFO,
  SERVICES_PATH,
  formatServicePrice,
  hasServiceRefinements,
  serviceCategoryLabel,
  serviceCategoryPath,
  serviceDirectoryHref,
  servicePhotoUrl,
  servicePlaceLine,
  type ServiceDetail,
  type ServiceFilters,
} from "@/lib/services";

// bet-02: the directory's title and description. Only the plain section and category pages are indexed; filtered and
// later pages are noindex, follow (like the stores directory).
export function buildServiceDirectoryMetadata(filters: ServiceFilters, page: number): Metadata {
  const info = filters.category ? SERVICE_CATEGORY_INFO[filters.category] : null;
  const base = info ? `${info.label} en Perú` : "Servicios para músicos en Perú";
  const title = filters.city ? `${info ? info.label : "Servicios para músicos"} en ${filters.city}` : base;
  const titled = page > 1 ? `${title} – Página ${page}` : title;
  const description = info
    ? `${info.blurb} Precios desde, zonas que atienden y reseñas de clientes confirmados. Escríbeles directo por WhatsApp.`
    : "Profesores de música, luthiers, salas de ensayo, estudios de grabación y sonido para eventos en Perú. Escríbeles directo por WhatsApp.";
  const plain = !hasServiceRefinements(filters) && page === 1;
  const canonical = filters.category ? serviceCategoryPath(filters.category) : SERVICES_PATH;
  return {
    title: titled,
    description,
    ...(plain ? { alternates: { canonical } } : { robots: NOINDEX_FOLLOW_ROBOTS }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${titled} | ${SITE_NAME}`, description, url: plain ? canonical : serviceDirectoryHref(filters, page), images: DEFAULT_OG_IMAGES },
  };
}

// A service's page. A preview (not public) is never indexed.
export function buildServiceMetadata(service: ServiceDetail): Metadata {
  const place = servicePlaceLine(service);
  const title = `${service.title} · ${service.provider.name}`;
  const description = truncateDescription(`${serviceCategoryLabel(service.category)}${place ? ` en ${place}` : ""}. ${formatServicePrice(service.priceFrom, service.priceUnit)}. ${service.description}`);
  const image = servicePhotoUrl(service.photoPaths[0]);
  return {
    title,
    description,
    ...(service.preview ? { robots: NOINDEX_FOLLOW_ROBOTS } : { alternates: { canonical: service.path } }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${title} | ${SITE_NAME}`, description, url: service.path, images: image ? [{ url: image, alt: service.title }] : DEFAULT_OG_IMAGES },
  };
}
