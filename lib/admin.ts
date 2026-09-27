import type { Json } from "@/lib/supabase/database.types";

export const ADMIN_QUEUES = [
  "publicaciones",
  "revisiones",
  "tiendas",
  "verificacion",
  "reportes",
  "resenas",
] as const;

export type AdminQueue = (typeof ADMIN_QUEUES)[number];

export type AdminCounts = Record<AdminQueue, number>;

export const EMPTY_ADMIN_COUNTS: AdminCounts = {
  publicaciones: 0,
  revisiones: 0,
  tiendas: 0,
  verificacion: 0,
  reportes: 0,
  resenas: 0,
};

export const ADMIN_QUEUE_LABELS: Record<AdminQueue, string> = {
  publicaciones: "Publicaciones",
  revisiones: "Cambios pendientes",
  tiendas: "Tiendas",
  verificacion: "Verificación",
  reportes: "Reportes",
  resenas: "Reseñas",
};

const ADMIN_VALUE_LABELS: Record<string, string> = {
  active: "Tienda",
  approved: "Aprobada",
  archived: "Archivada",
  cancelled: "Cancelada",
  confirmed: "Confirmada",
  dismissed: "Desestimado",
  hidden: "Oculta",
  individual: "Particular",
  listing: "Publicación",
  listing_revision: "Cambio de publicación",
  open: "Abierto",
  pending: "Pendiente",
  rejected: "Rechazada",
  report: "Reporte",
  resolved: "Resuelto",
  review: "Reseña",
  seller: "Particular",
  sold: "Vendida",
  store: "Tienda",
  store_owner: "Propietario de tienda",
  verified: "Verificada",
  acoso: "Acoso",
  articulo_prohibido: "Artículo o contenido prohibido",
  contenido_inapropiado: "Contenido inapropiado",
  informacion_falsa: "Información falsa o engañosa",
  posible_estafa: "Posible estafa",
  spam: "Spam",
  otro: "Otro",
  title: "título",
  attributes: "Características",
  category: "categoría",
  instrument_type: "tipo de instrumento",
  brand: "marca",
  model: "modelo",
  condition: "estado del producto",
  price_pen: "precio",
  description: "descripción",
  photos: "fotos",
  from: "Estado anterior",
  to: "Estado nuevo",
  reason: "Motivo",
  note: "Nota",
  owner_user_id: "Cuenta vinculada",
  previous_owner_user_id: "Propietario anterior",
  historical_contact_name: "Contacto histórico",
  historical_whatsapp: "WhatsApp histórico",
  listing_approved: "Publicación aprobada",
  listing_rejected: "Publicación rechazada",
  listing_hidden: "Publicación ocultada",
  listing_sold: "Publicación marcada vendida",
  listing_content_updated: "Contenido de publicación actualizado",
  listing_revision_approved: "Cambio de publicación aprobado",
  listing_revision_rejected: "Cambio de publicación rechazado",
  store_active: "Tienda aprobada",
  store_rejected: "Tienda rechazada",
  store_hidden: "Tienda ocultada",
  store_verified: "Tienda verificada",
  store_verification_revoked: "Verificación revocada",
  store_profile_updated: "Perfil de tienda actualizado",
  report_resolved: "Reporte resuelto",
  report_dismissed: "Reporte desestimado",
  review_hidden: "Reseña ocultada",
  review_restored: "Reseña restaurada",
  legacy_owner_linked: "Propiedad legacy vinculada",
};

export function adminValueLabel(value: string) {
  return ADMIN_VALUE_LABELS[value] ?? value.replaceAll("_", " ");
}

export const ADMIN_DOMAINS = [
  "publicaciones",
  "revisiones",
  "tiendas",
  "usuarios",
  "reportes",
  "resenas",
  "transacciones",
  "legacy",
] as const;

export type AdminDomain = (typeof ADMIN_DOMAINS)[number];

export type AdminJsonItem = Record<string, Json | undefined>;

export type AdminQueuePayload = {
  queue: AdminQueue;
  page: number;
  page_size: number;
  total: number;
  counts: AdminCounts;
  items: AdminJsonItem[];
};

export type AdminDomainPayload = {
  domain: AdminDomain;
  page: number;
  page_size: number;
  total: number;
  items: AdminJsonItem[];
  users: AdminJsonItem[];
  user_page: number;
  user_total: number;
};

export function isAdminQueue(value: string | null | undefined): value is AdminQueue {
  return ADMIN_QUEUES.includes(value as AdminQueue);
}

export function isAdminDomain(value: string): value is AdminDomain {
  return ADMIN_DOMAINS.includes(value as AdminDomain);
}

function finiteCount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseAdminCounts(value: Json | null): AdminCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (ADMIN_QUEUES.some((queue) => !Number.isFinite(Number(value[queue])))) {
    return null;
  }

  return {
    publicaciones: finiteCount(value.publicaciones),
    revisiones: finiteCount(value.revisiones),
    tiendas: finiteCount(value.tiendas),
    verificacion: finiteCount(value.verificacion),
    reportes: finiteCount(value.reportes),
    resenas: finiteCount(value.resenas),
  };
}

function parseItems(value: unknown): AdminJsonItem[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is AdminJsonItem =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

export function parseAdminQueuePayload(value: Json | null): AdminQueuePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const queue = typeof value.queue === "string" ? value.queue : null;
  if (!isAdminQueue(queue)) return null;
  const counts = parseAdminCounts((value.counts ?? null) as Json | null);
  if (!counts) return null;

  return {
    queue,
    page: Math.max(1, finiteCount(value.page)),
    page_size: Math.max(1, finiteCount(value.page_size)),
    total: finiteCount(value.total),
    counts,
    items: parseItems(value.items),
  };
}

export function parseAdminDomainPayload(value: Json | null): AdminDomainPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const domain = typeof value.domain === "string" ? value.domain : "";
  if (!isAdminDomain(domain)) return null;

  return {
    domain,
    page: Math.max(1, finiteCount(value.page)),
    page_size: Math.max(1, finiteCount(value.page_size)),
    total: finiteCount(value.total),
    items: parseItems(value.items),
    users: parseItems(value.users),
    user_page: Math.max(1, finiteCount(value.user_page ?? 1)),
    user_total: finiteCount(value.user_total),
  };
}

export function firstActionableQueue(counts: AdminCounts | null): AdminQueue {
  return ADMIN_QUEUES.find((queue) => (counts?.[queue] ?? 0) > 0) ?? "publicaciones";
}

export function positivePage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
