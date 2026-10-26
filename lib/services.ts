// Feature ideas, services batch, bet-02 (docs/feature-ideas/services.md): "Servicios para músicos". Teachers,
// luthiers and repair shops, rehearsal rooms, recording studios and sound for events. Services never mix with
// instruments: their own tables, RPCs and pages under /servicios. Shared by the pages, the forms, the API route and the
// tests: the vocabulary with its labels, the URL helpers, the client-side checks, the RPC output readers and the error
// mapping. The database (supabase/migrations/20261208120000_feat_services.sql) has the final word; keep both lists in
// step.

import { hasContactDetails } from "@/lib/listing-questions";
import { isValidWhatsAppPhone } from "@/lib/phone";
import { absoluteUrl } from "@/lib/site";

export const SERVICE_CATEGORIES = ["clases", "reparaciones", "ensayo", "grabacion", "sonido"] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const SERVICE_MODALITIES = ["en_local", "a_domicilio", "en_linea"] as const;
export type ServiceModality = (typeof SERVICE_MODALITIES)[number];

export const SERVICE_UNITS = ["clase", "hora", "mes", "trabajo", "sesion", "cancion", "evento", "dia"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

export const SERVICE_SORTS = ["recientes", "valorados", "precio"] as const;
export type ServiceSort = (typeof SERVICE_SORTS)[number];

export const SERVICE_TITLE_MIN = 8;
export const SERVICE_TITLE_MAX = 90;
export const SERVICE_PROVIDER_MIN = 2;
export const SERVICE_PROVIDER_MAX = 80;
export const SERVICE_DESCRIPTION_MIN = 40;
export const SERVICE_DESCRIPTION_MAX = 2000;
export const SERVICE_PRICE_MAX = 100000;
export const SERVICE_AREAS_MAX = 12;
export const SERVICE_AREA_MAX = 60;
export const SERVICE_SKILLS_MAX = 8;
export const SERVICE_PHOTOS_MAX = 6;
export const SERVICE_REVIEW_COMMENT_MAX = 1000;
export const SERVICE_PAGE_SIZE = 24;
export const SERVICE_PHOTO_BUCKET = "service-photos";

type CategoryInfo = {
  // The URL segment (/servicios/<slug>).
  slug: string;
  label: string;
  // One line under the name on the directory and in the form.
  blurb: string;
  // What the provider is called in copy ("profesor", "taller").
  units: readonly ServiceUnit[];
  modalities: readonly ServiceModality[];
  skills: readonly string[];
  // The question above the skill chips; null when the category has none.
  skillsQuestion: string | null;
  skillsFilterLabel: string | null;
  titleExample: string;
};

export const SERVICE_CATEGORY_INFO: Record<ServiceCategory, CategoryInfo> = {
  clases: {
    slug: "clases",
    label: "Clases de música",
    blurb: "Profesores de instrumento, canto, teoría y producción.",
    units: ["clase", "hora", "mes"],
    modalities: ["en_local", "a_domicilio", "en_linea"],
    skills: ["guitarra", "bajo", "bateria", "piano", "canto", "cuerdas", "vientos", "andinos", "ukelele", "produccion", "teoria"],
    skillsQuestion: "¿Qué enseñas?",
    skillsFilterLabel: "Qué enseña",
    titleExample: "Clases de guitarra y canto para principiantes",
  },
  reparaciones: {
    slug: "reparaciones",
    label: "Luthería y reparaciones",
    blurb: "Luthiers y talleres: calibración, arreglos y mantenimiento.",
    units: ["trabajo", "hora"],
    modalities: ["en_local", "a_domicilio"],
    skills: ["guitarra", "bajo", "bateria", "piano", "cuerdas", "vientos", "andinos", "ukelele", "amplificadores", "pedales", "audio"],
    skillsQuestion: "¿Qué reparas?",
    skillsFilterLabel: "Qué repara",
    titleExample: "Calibración y reparación de guitarras y bajos",
  },
  ensayo: {
    slug: "salas-de-ensayo",
    label: "Salas de ensayo",
    blurb: "Salas equipadas para ensayar por hora o por sesión.",
    units: ["hora", "sesion"],
    modalities: ["en_local"],
    skills: [],
    skillsQuestion: null,
    skillsFilterLabel: null,
    titleExample: "Sala de ensayo con batería y amplificadores",
  },
  grabacion: {
    slug: "estudios-de-grabacion",
    label: "Estudios de grabación",
    blurb: "Grabación, mezcla y masterización.",
    units: ["hora", "sesion", "cancion"],
    modalities: ["en_local", "en_linea"],
    skills: [],
    skillsQuestion: null,
    skillsFilterLabel: null,
    titleExample: "Grabación y mezcla de maquetas",
  },
  sonido: {
    slug: "sonido-para-eventos",
    label: "Sonido para eventos",
    blurb: "Equipos de sonido y técnicos para conciertos y celebraciones.",
    units: ["evento", "hora", "dia"],
    modalities: ["a_domicilio"],
    skills: [],
    skillsQuestion: null,
    skillsFilterLabel: null,
    titleExample: "Sonido e iluminación para matrimonios y conciertos",
  },
};

export const SERVICE_SKILL_LABELS: Record<string, string> = {
  guitarra: "Guitarra",
  bajo: "Bajo",
  bateria: "Batería y percusión",
  piano: "Piano y teclados",
  canto: "Canto",
  cuerdas: "Violín y cuerdas",
  vientos: "Vientos",
  andinos: "Instrumentos andinos",
  ukelele: "Ukelele",
  produccion: "Producción musical",
  teoria: "Teoría y lectura",
  amplificadores: "Amplificadores",
  pedales: "Pedales y efectos",
  audio: "Equipos de audio",
};

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  clase: "por clase",
  hora: "por hora",
  mes: "al mes",
  trabajo: "por trabajo",
  sesion: "por sesión",
  cancion: "por canción",
  evento: "por evento",
  dia: "por día",
};

// How buyers read where the service happens. Sound for events always goes to the client's event.
export function serviceModalityLabel(modality: ServiceModality, category?: ServiceCategory) {
  if (modality === "a_domicilio" && category === "sonido") return "En tu evento";
  return modality === "en_local" ? "En su local" : modality === "a_domicilio" ? "A domicilio" : "En línea";
}

// The same, as the provider picks it in the form.
export function serviceModalityOwnerLabel(modality: ServiceModality, category: ServiceCategory) {
  if (modality === "a_domicilio") return category === "sonido" ? "En el lugar del evento" : "A domicilio";
  if (modality === "en_linea") return "En línea";
  return category === "clases" ? "En mi local o casa" : category === "reparaciones" ? "En mi taller" : "En mi local";
}

export function isServiceCategory(value: unknown): value is ServiceCategory {
  return typeof value === "string" && (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export function isServiceModality(value: unknown): value is ServiceModality {
  return typeof value === "string" && (SERVICE_MODALITIES as readonly string[]).includes(value);
}

export function isServiceUnit(value: unknown): value is ServiceUnit {
  return typeof value === "string" && (SERVICE_UNITS as readonly string[]).includes(value);
}

export function serviceCategoryFromSlug(slug: string | null | undefined): ServiceCategory | null {
  return SERVICE_CATEGORIES.find((category) => SERVICE_CATEGORY_INFO[category].slug === slug) ?? null;
}

export function serviceCategoryLabel(category: string | null | undefined) {
  return isServiceCategory(category) ? SERVICE_CATEGORY_INFO[category].label : "Servicio";
}

export function serviceSkillLabel(skill: string) {
  return SERVICE_SKILL_LABELS[skill] ?? skill;
}

// "Desde S/ 50 por clase".
export function formatServicePrice(price: number, unit: string) {
  const amount = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(price);
  return `Desde S/ ${amount} ${isServiceUnit(unit) ? SERVICE_UNIT_LABELS[unit] : ""}`.trim();
}

// ------------------------------------------------------------------ URLs

export const SERVICES_PATH = "/servicios";

export function serviceCategoryPath(category: ServiceCategory) {
  return `${SERVICES_PATH}/${SERVICE_CATEGORY_INFO[category].slug}`;
}

export function servicePath(category: string, slug: string) {
  return isServiceCategory(category) ? `${serviceCategoryPath(category)}/${slug}` : SERVICES_PATH;
}

// The public address of a photo in the service-photos bucket.
export function servicePhotoUrl(path: string | null | undefined) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${SERVICE_PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export type ServiceFilters = {
  category?: ServiceCategory;
  city?: string;
  modality?: ServiceModality;
  skill?: string;
  sort: ServiceSort;
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The directory's query (?ciudad=&modalidad=&instrumento=&orden=); unknown values are dropped, so a garbled link
// shows the plain list instead of an empty one.
export function parseServiceFilters(params: Record<string, string | string[] | undefined>, category?: ServiceCategory | null): ServiceFilters {
  const city = first(params.ciudad)?.replace(/\s+/g, " ").trim().slice(0, SERVICE_AREA_MAX) || undefined;
  const modality = first(params.modalidad);
  const skill = first(params.instrumento);
  const sort = first(params.orden);
  return {
    ...(category ? { category } : {}),
    ...(city && city.length >= 2 ? { city } : {}),
    ...(isServiceModality(modality) && (!category || SERVICE_CATEGORY_INFO[category].modalities.includes(modality)) ? { modality } : {}),
    ...(skill && category && SERVICE_CATEGORY_INFO[category].skills.includes(skill) ? { skill } : {}),
    sort: (SERVICE_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ServiceSort) : "recientes",
  };
}

export function serviceDirectoryParams(filters: Partial<ServiceFilters>) {
  const query: Record<string, string> = {};
  if (filters.city) query.ciudad = filters.city;
  if (filters.modality) query.modalidad = filters.modality;
  if (filters.skill) query.instrumento = filters.skill;
  if (filters.sort && filters.sort !== "recientes") query.orden = filters.sort;
  return query;
}

export function serviceDirectoryHref(filters: Partial<ServiceFilters>, page = 1) {
  const query = new URLSearchParams(serviceDirectoryParams(filters));
  if (page > 1) query.set("page", String(page));
  const path = filters.category ? serviceCategoryPath(filters.category) : SERVICES_PATH;
  return query.size ? `${path}?${query}` : path;
}

export function hasServiceRefinements(filters: ServiceFilters) {
  return Boolean(filters.city || filters.modality || filters.skill || filters.sort !== "recientes");
}

// The RPC's p_filters.
export function serviceRpcFilters(filters: ServiceFilters) {
  return {
    category: filters.category ?? null,
    city: filters.city ?? null,
    modality: filters.modality ?? null,
    skill: filters.skill ?? null,
    sort: filters.sort,
  };
}

// ------------------------------------------------------------------ the form's checks

export type ServiceFormValues = {
  category: ServiceCategory;
  title: string;
  providerName: string;
  description: string;
  price: string;
  unit: string;
  modalities: string[];
  skills: string[];
  city: string;
  region: string;
  district: string;
  areas: string[];
  whatsapp: string;
  photoPaths: string[];
};

export type ServiceFormField = "title" | "providerName" | "description" | "price" | "unit" | "modalities" | "skills" | "city" | "areas" | "whatsapp";

export const SERVICE_CONTACT_MESSAGE =
  "No escribas números de teléfono, enlaces ni correos en el servicio. Los músicos te escriben con el botón de WhatsApp.";

export function foldLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

// Running text as the database keeps it: spaces folded inside each line, at most one empty line in a row.
export function foldParagraphs(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// "1,250" or "S/ 1,250" → 1250; null when it is not a whole number of soles.
export function readServicePrice(value: string) {
  const digits = value.replace(/^\s*S\/\s*/i, "").replace(/[,\s]/g, "");
  if (!/^\d{1,6}$/.test(digits)) return null;
  const price = Number(digits);
  return price >= 1 && price <= SERVICE_PRICE_MAX ? price : null;
}

// Areas typed one per line or separated by commas; the same place twice (case and accents aside) once.
export function readServiceAreas(value: string | string[]) {
  const items = (Array.isArray(value) ? value : value.split(/[\n,;]/)).map(foldLine).filter(Boolean);
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = placeKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function placeKey(value: string) {
  return foldLine(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-PE");
}

// The instant checks before saving, in field order; the database repeats every one.
export function serviceFormErrors(values: ServiceFormValues, { isStore }: { isStore: boolean }) {
  const info = SERVICE_CATEGORY_INFO[values.category];
  const errors: { field: ServiceFormField; message: string }[] = [];
  const title = foldLine(values.title);
  const description = foldParagraphs(values.description);
  const provider = foldLine(values.providerName);
  if (title.length < SERVICE_TITLE_MIN || title.length > SERVICE_TITLE_MAX) {
    errors.push({ field: "title", message: `El título debe tener entre ${SERVICE_TITLE_MIN} y ${SERVICE_TITLE_MAX} caracteres.` });
  } else if (hasContactDetails(title)) errors.push({ field: "title", message: SERVICE_CONTACT_MESSAGE });
  if (!isStore) {
    if (provider.length < SERVICE_PROVIDER_MIN || provider.length > SERVICE_PROVIDER_MAX) {
      errors.push({ field: "providerName", message: `El nombre debe tener entre ${SERVICE_PROVIDER_MIN} y ${SERVICE_PROVIDER_MAX} caracteres.` });
    } else if (hasContactDetails(provider)) errors.push({ field: "providerName", message: SERVICE_CONTACT_MESSAGE });
  }
  if (description.length < SERVICE_DESCRIPTION_MIN || description.length > SERVICE_DESCRIPTION_MAX) {
    errors.push({ field: "description", message: `La descripción debe tener entre ${SERVICE_DESCRIPTION_MIN} y ${SERVICE_DESCRIPTION_MAX} caracteres.` });
  } else if (hasContactDetails(description)) errors.push({ field: "description", message: SERVICE_CONTACT_MESSAGE });
  if (readServicePrice(values.price) === null) errors.push({ field: "price", message: "Indica un precio desde, en soles, entre S/ 1 y S/ 100,000." });
  if (!info.units.includes(values.unit as ServiceUnit)) errors.push({ field: "unit", message: "Elige por qué se cobra el precio." });
  if (values.modalities.length === 0 || values.modalities.some((item) => !info.modalities.includes(item as ServiceModality))) {
    errors.push({ field: "modalities", message: "Indica dónde das el servicio." });
  }
  if (info.skills.length > 0 && (values.skills.length === 0 || values.skills.length > SERVICE_SKILLS_MAX)) {
    errors.push({ field: "skills", message: values.category === "clases" ? "Elige entre 1 y 8 instrumentos o temas que enseñas." : "Elige entre 1 y 8 instrumentos o equipos que reparas." });
  }
  if (foldLine(values.city).length < 2) errors.push({ field: "city", message: "Indica la ciudad donde das el servicio." });
  const areas = readServiceAreas(values.areas);
  if (areas.length > SERVICE_AREAS_MAX || areas.some((area) => area.length < 2 || area.length > SERVICE_AREA_MAX)) {
    errors.push({ field: "areas", message: `Indica hasta ${SERVICE_AREAS_MAX} zonas, de 2 a ${SERVICE_AREA_MAX} caracteres cada una.` });
  }
  if (!isValidWhatsAppPhone(values.whatsapp)) errors.push({ field: "whatsapp", message: "Indica un número de WhatsApp válido." });
  return errors;
}

// The save_service payload.
export function serviceSavePayload(values: ServiceFormValues, { isStore }: { isStore: boolean }) {
  return {
    category: values.category,
    title: foldLine(values.title),
    ...(isStore ? {} : { provider_name: foldLine(values.providerName) }),
    description: foldParagraphs(values.description),
    price_from_pen: readServicePrice(values.price),
    price_unit: values.unit,
    modalities: values.modalities,
    skills: SERVICE_CATEGORY_INFO[values.category].skills.length ? values.skills : [],
    city: foldLine(values.city),
    region: foldLine(values.region) || null,
    district: foldLine(values.district) || null,
    areas: readServiceAreas(values.areas),
    whatsapp_phone: values.whatsapp,
    photo_paths: values.photoPaths,
  };
}

// ------------------------------------------------------------------ RPC output

export type ServiceProvider = {
  name: string;
  kind: "particular" | "store" | "verified";
  storeSlug: string | null;
  logoUrl: string | null;
  since: string | null;
};

export type ServiceRating = { count: number; average: number | null };

export type ServiceCard = {
  id: string;
  slug: string;
  category: ServiceCategory;
  path: string;
  title: string;
  provider: ServiceProvider;
  priceFrom: number;
  priceUnit: string;
  city: string;
  district: string | null;
  region: string | null;
  areas: string[];
  modalities: ServiceModality[];
  skills: string[];
  coverPath: string | null;
  rating: ServiceRating;
};

export type ServiceReview = { id: string; rating: number; comment: string | null; reviewerName: string; createdAt: string };

export type ServiceDetail = ServiceCard & {
  description: string;
  photoPaths: string[];
  whatsappPhone: string;
  status: string;
  preview: boolean;
  isOwner: boolean;
  updatedAt: string | null;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: ServiceReview[];
  otherServices: { id: string; title: string; category: ServiceCategory; path: string; priceFrom: number; priceUnit: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function readProvider(value: unknown): ServiceProvider {
  const row = isRecord(value) ? value : {};
  const kind = row.kind === "verified" || row.kind === "store" ? row.kind : "particular";
  return { name: text(row.name) ?? "Proveedor de Laria", kind, storeSlug: text(row.store_slug), logoUrl: text(row.logo_url), since: text(row.since) };
}

function readRating(value: unknown): ServiceRating {
  const row = isRecord(value) ? value : {};
  return { count: num(row.count) ?? 0, average: num(row.average) };
}

export function readServiceCard(value: unknown): ServiceCard | null {
  if (!isRecord(value) || !text(value.id) || !text(value.slug) || !isServiceCategory(value.category) || !text(value.title)) return null;
  return {
    id: value.id as string,
    slug: value.slug as string,
    category: value.category,
    path: servicePath(value.category, value.slug as string),
    title: value.title as string,
    provider: readProvider(value.provider),
    priceFrom: num(value.price_from_pen) ?? 0,
    priceUnit: text(value.price_unit) ?? "",
    city: text(value.city) ?? "",
    district: text(value.district),
    region: text(value.region),
    areas: strings(value.areas),
    modalities: strings(value.modalities).filter(isServiceModality),
    skills: strings(value.skills),
    coverPath: text(value.cover_path),
    rating: readRating(value.rating),
  };
}

export function readServicePage(value: unknown) {
  const row = isRecord(value) ? value : {};
  const items = Array.isArray(row.items) ? row.items.map(readServiceCard).filter((item): item is ServiceCard => item !== null) : [];
  return { total: num(row.total) ?? 0, page: num(row.page) ?? 1, items };
}

function readReview(value: unknown): ServiceReview | null {
  if (!isRecord(value) || !text(value.id) || num(value.rating) === null) return null;
  return { id: value.id as string, rating: num(value.rating) as number, comment: text(value.comment), reviewerName: text(value.reviewer_name) ?? "Cliente de Laria", createdAt: text(value.created_at) ?? "" };
}

export function readServiceReviews(value: unknown) {
  const items = isRecord(value) && Array.isArray(value.items) ? value.items : [];
  return items.map(readReview).filter((item): item is ServiceReview => item !== null);
}

export function readServiceDetail(value: unknown): ServiceDetail | null {
  const card = readServiceCard(value);
  if (!card || !isRecord(value)) return null;
  const breakdown = isRecord(value.breakdown) ? value.breakdown : {};
  return {
    ...card,
    description: text(value.description) ?? "",
    photoPaths: strings(value.photo_paths),
    whatsappPhone: text(value.whatsapp_phone) ?? "",
    status: text(value.status) ?? "approved",
    preview: value.preview === true,
    isOwner: value.is_owner === true,
    updatedAt: text(value.updated_at),
    breakdown: { 1: num(breakdown["1"]) ?? 0, 2: num(breakdown["2"]) ?? 0, 3: num(breakdown["3"]) ?? 0, 4: num(breakdown["4"]) ?? 0, 5: num(breakdown["5"]) ?? 0 },
    reviews: (Array.isArray(value.reviews) ? value.reviews : []).map(readReview).filter((item): item is ServiceReview => item !== null),
    otherServices: (Array.isArray(value.other_services) ? value.other_services : []).flatMap((item) => {
      if (!isRecord(item) || !text(item.id) || !isServiceCategory(item.category) || !text(item.title) || !text(item.path)) return [];
      return [{ id: item.id as string, title: item.title as string, category: item.category, path: item.path as string, priceFrom: num(item.price_from_pen) ?? 0, priceUnit: text(item.price_unit) ?? "" }];
    }),
  };
}

export type ServiceViewerState = {
  signedIn: boolean;
  isOwner: boolean;
  contacted: boolean;
  canClaim: boolean;
  booking: { id: string; status: string; requestedBy: "provider" | "client"; reviewDeadline: string | null } | null;
  hasReview: boolean;
  canReview: boolean;
};

export const EMPTY_VIEWER_STATE: ServiceViewerState = { signedIn: false, isOwner: false, contacted: false, canClaim: false, booking: null, hasReview: false, canReview: false };

export function readServiceViewerState(value: unknown): ServiceViewerState {
  if (!isRecord(value)) return EMPTY_VIEWER_STATE;
  const booking = isRecord(value.booking) && text(value.booking.id)
    ? { id: value.booking.id as string, status: text(value.booking.status) ?? "pending", requestedBy: value.booking.requested_by === "provider" ? "provider" as const : "client" as const, reviewDeadline: text(value.booking.review_deadline) }
    : null;
  return {
    signedIn: value.signed_in === true,
    isOwner: value.is_owner === true,
    contacted: value.contacted === true,
    canClaim: value.can_claim === true,
    booking,
    hasReview: value.has_review === true,
    canReview: value.can_review === true,
  };
}

export type OwnerService = {
  id: string;
  slug: string;
  category: ServiceCategory;
  path: string;
  title: string;
  providerName: string;
  provider: ServiceProvider;
  isStore: boolean;
  description: string;
  priceFrom: number;
  priceUnit: string;
  modalities: ServiceModality[];
  skills: string[];
  city: string;
  region: string | null;
  district: string | null;
  areas: string[];
  whatsappPhone: string;
  photoPaths: string[];
  status: string;
  isPublic: boolean;
  moderationReason: string | null;
  needsRecheck: boolean;
  version: number;
  updatedAt: string | null;
  stats: { views30d: number; contacts30d: number; contactsTotal: number } | null;
  rating: ServiceRating | null;
  confirmedClients: number;
  canDelete: boolean;
};

export function readOwnerService(value: unknown): OwnerService | null {
  if (!isRecord(value) || !text(value.id) || !isServiceCategory(value.category) || !text(value.title)) return null;
  const stats = isRecord(value.stats) ? value.stats : null;
  return {
    id: value.id as string,
    slug: text(value.slug) ?? "",
    category: value.category,
    path: text(value.path) ?? servicePath(value.category, text(value.slug) ?? ""),
    title: value.title as string,
    providerName: text(value.provider_name) ?? "",
    provider: readProvider(value.provider),
    isStore: value.is_store === true,
    description: text(value.description) ?? "",
    priceFrom: num(value.price_from_pen) ?? 0,
    priceUnit: text(value.price_unit) ?? "",
    modalities: strings(value.modalities).filter(isServiceModality),
    skills: strings(value.skills),
    city: text(value.city) ?? "",
    region: text(value.region),
    district: text(value.district),
    areas: strings(value.areas),
    whatsappPhone: text(value.whatsapp_phone) ?? "",
    photoPaths: strings(value.photo_paths),
    status: text(value.status) ?? "pending",
    isPublic: value.public === true,
    moderationReason: text(value.moderation_reason),
    needsRecheck: value.needs_recheck === true,
    version: num(value.version) ?? 1,
    updatedAt: text(value.updated_at),
    stats: stats ? { views30d: num(stats.views_30d) ?? 0, contacts30d: num(stats.contacts_30d) ?? 0, contactsTotal: num(stats.contacts_total) ?? 0 } : null,
    rating: isRecord(value.rating) ? readRating(value.rating) : null,
    confirmedClients: num(value.confirmed_clients) ?? 0,
    canDelete: value.can_delete !== false,
  };
}

export function readOwnerServices(value: unknown) {
  return (Array.isArray(value) ? value : []).map(readOwnerService).filter((item): item is OwnerService => item !== null);
}

export type ServiceBooking = {
  id: string;
  role: "provider" | "client";
  requestedBy: "provider" | "client";
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  reviewDeadline: string | null;
  service: { id: string; title: string; category: ServiceCategory | null; path: string; isPublic: boolean; providerName: string };
  otherName: string;
  review: { id: string; rating: number; comment: string | null; status: string } | null;
  clientHasReview: boolean;
};

export function readServiceBookings(value: unknown): ServiceBooking[] {
  return (Array.isArray(value) ? value : []).flatMap((row): ServiceBooking[] => {
    if (!isRecord(row) || !text(row.id) || !isRecord(row.service) || !text(row.service.id)) return [];
    const service = row.service;
    const review = isRecord(row.review) && text(row.review.id) ? { id: row.review.id as string, rating: num(row.review.rating) ?? 0, comment: text(row.review.comment), status: text(row.review.status) ?? "visible" } : null;
    return [{
      id: row.id as string,
      role: row.role === "provider" ? "provider" : "client",
      requestedBy: row.requested_by === "provider" ? "provider" : "client",
      status: text(row.status) ?? "pending",
      createdAt: text(row.created_at) ?? "",
      confirmedAt: text(row.confirmed_at),
      reviewDeadline: text(row.review_deadline),
      service: {
        id: service.id as string,
        title: text(service.title) ?? "Servicio",
        category: isServiceCategory(service.category) ? service.category : null,
        path: text(service.path) ?? SERVICES_PATH,
        isPublic: service.public === true,
        providerName: text(service.provider_name) ?? "",
      },
      otherName: text(row.other_name) ?? "Usuario de Laria",
      review,
      clientHasReview: row.client_has_review === true,
    }];
  });
}

export type BookingCandidate = { userId: string; name: string; lastContactAt: string; phoneTail: string | null };

export function readBookingCandidates(value: unknown): BookingCandidate[] {
  return (Array.isArray(value) ? value : []).flatMap((row) => {
    if (!isRecord(row) || !text(row.user_id)) return [];
    return [{ userId: row.user_id as string, name: text(row.name) ?? "Usuario de Laria", lastContactAt: text(row.last_contact_at) ?? "", phoneTail: text(row.phone_tail) }];
  });
}

// What a booking means to the person looking at it, and what they can do.
export function bookingActions(booking: ServiceBooking) {
  const waitingOnMe = booking.status === "pending" && booking.requestedBy !== booking.role;
  const mine = booking.status === "pending" && booking.requestedBy === booking.role;
  const canReview = booking.role === "client" && booking.status === "confirmed" && !booking.review && !booking.clientHasReview
    && Boolean(booking.reviewDeadline) && Date.parse(booking.reviewDeadline as string) > Date.now();
  return { canAnswer: waitingOnMe, canCancel: mine, canReview };
}

// ------------------------------------------------------------------ errors

// 'SERVICE_CODE: mensaje' from the database → the message, as written there. Anything else (a network or permission
// error) becomes the caller's retry message; internal text never reaches the page.
export function serviceErrorMessage(message: string | null | undefined, fallback: string) {
  const match = /SERVICE_[A-Z_]+: ([\s\S]+)$/.exec(message ?? "");
  return match ? match[1].trim() : fallback;
}

export function serviceErrorCode(message: string | null | undefined) {
  return /\b(SERVICE_[A-Z_]+):/.exec(message ?? "")?.[1] ?? null;
}

// The form field a save error belongs to, so the message shows under it.
export function serviceErrorField(code: string | null): ServiceFormField | "photos" | null {
  switch (code) {
    case "SERVICE_TITLE_LENGTH": return "title";
    case "SERVICE_PROVIDER_LENGTH": return "providerName";
    case "SERVICE_DESCRIPTION_LENGTH": return "description";
    case "SERVICE_PRICE_INVALID": return "price";
    case "SERVICE_UNIT_INVALID": return "unit";
    case "SERVICE_MODALITY_INVALID": return "modalities";
    case "SERVICE_SKILLS_INVALID": return "skills";
    case "SERVICE_CITY_REQUIRED": return "city";
    case "SERVICE_AREAS_INVALID": return "areas";
    case "SERVICE_PHONE_INVALID": return "whatsapp";
    case "SERVICE_PHOTOS_INVALID": return "photos";
    default: return null;
  }
}

// The WhatsApp message the button opens with: the service and its page, then the question.
export function serviceContactMessage(service: Pick<ServiceCard, "title" | "path" | "provider">) {
  const particular = service.provider.kind === "particular";
  return `Hola, vi ${particular ? "tu" : "su"} servicio "${service.title}" en Laria: ${absoluteUrl(service.path)} ¿${particular ? "Tienes" : "Tienen"} disponibilidad?`;
}

// ------------------------------------------------------------------ small labels

export function serviceRatingLabel(rating: ServiceRating) {
  if (!rating.count || rating.average === null) return null;
  return `${(Math.round(rating.average * 10) / 10).toFixed(1)} de 5 · ${rating.count} ${rating.count === 1 ? "reseña" : "reseñas"}`;
}

export function servicePlaceLine(service: Pick<ServiceCard, "city" | "district" | "region">) {
  return [service.district, service.city, service.region && service.region !== service.city ? service.region : null].filter(Boolean).join(", ");
}

export function serviceCountLabel(count: number) {
  return `${new Intl.NumberFormat("es-PE").format(count)} ${count === 1 ? "servicio" : "servicios"}`;
}
