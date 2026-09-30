// The one status dictionary (docs/ux-redesign/ux-1-foundations.md, decision D8). Only the visible label
// and its tone live here; meanings and transitions stay as in docs/functional-spec.md.
export type StatusTone = "neutral" | "accent" | "warning" | "danger" | "solid" | "line";
export type StatusIcon = "draft" | "review" | "check" | "reject" | "hidden" | "sold" | "archive" | "pause";
export type StatusEntry = { label: string; tone: StatusTone; icon?: StatusIcon };
export type StatusDomain = "listing" | "revision" | "store" | "claim" | "transaction" | "report" | "review" | "alert";

const LISTING: Record<string, StatusEntry> = {
  draft: { label: "Borrador", tone: "line", icon: "draft" },
  pending: { label: "En revisión", tone: "warning", icon: "review" },
  approved: { label: "Publicada", tone: "accent", icon: "check" },
  rejected: { label: "Rechazada", tone: "danger", icon: "reject" },
  hidden: { label: "Oculta", tone: "neutral", icon: "hidden" },
  sold: { label: "Vendida", tone: "solid", icon: "sold" },
  archived: { label: "Archivada", tone: "neutral", icon: "archive" },
};

const REVISION: Record<string, StatusEntry> = {
  pending: { label: "Cambios en revisión", tone: "warning", icon: "review" },
  approved: { label: "Cambios aprobados", tone: "accent", icon: "check" },
  rejected: { label: "Cambios rechazados", tone: "danger", icon: "reject" },
  cancelled: { label: "Cambios cancelados", tone: "neutral" },
};

const STORE: Record<string, StatusEntry> = {
  pending: { label: "En revisión", tone: "warning", icon: "review" },
  active: { label: "Activa", tone: "accent", icon: "check" },
  rejected: { label: "Rechazada", tone: "danger", icon: "reject" },
  hidden: { label: "Oculta", tone: "neutral", icon: "hidden" },
};

// Buyer and seller view of a sale (Compras y ventas); lib/transactions.ts reads its labels from here.
const CLAIM: Record<string, StatusEntry> = {
  unattributed: { label: "Venta sin atribuir", tone: "neutral" },
  pending: { label: "Comprador pendiente de confirmar", tone: "warning", icon: "review" },
  confirmed: { label: "Compra confirmada", tone: "accent", icon: "check" },
  verified: { label: "Transacción verificada por ambas partes", tone: "accent", icon: "check" },
  declined: { label: "El contacto indicó que no fue comprador", tone: "danger", icon: "reject" },
  cancelled: { label: "Solicitud cancelada", tone: "neutral" },
  superseded: { label: "Solicitud reemplazada", tone: "neutral" },
  external: { label: "Venta fuera de Laria", tone: "neutral" },
};

// Admin view of a sale record: "verified" means a verified transaction exists for the claim.
const TRANSACTION: Record<string, StatusEntry> = {
  pending: { label: "Pendiente", tone: "warning", icon: "review" },
  confirmed: { label: "Confirmada", tone: "accent", icon: "check" },
  verified: { label: "Verificada", tone: "accent", icon: "check" },
  declined: { label: "Rechazada por comprador", tone: "danger", icon: "reject" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  superseded: { label: "Reemplazada", tone: "neutral" },
  external: { label: "Fuera de Laria", tone: "neutral" },
};

const REPORT: Record<string, StatusEntry> = {
  open: { label: "Abierto", tone: "warning", icon: "review" },
  resolved: { label: "Resuelto", tone: "accent", icon: "check" },
  dismissed: { label: "Desestimado", tone: "neutral" },
};

const REVIEW: Record<string, StatusEntry> = {
  visible: { label: "Visible", tone: "accent", icon: "check" },
  hidden: { label: "Oculta", tone: "neutral", icon: "hidden" },
};

const ALERT: Record<string, StatusEntry> = {
  active: { label: "Activa", tone: "accent", icon: "check" },
  paused: { label: "Pausada", tone: "neutral", icon: "pause" },
  deleted: { label: "Eliminada", tone: "neutral" },
};

const DICTIONARY: Record<StatusDomain, Record<string, StatusEntry>> = {
  listing: LISTING,
  revision: REVISION,
  store: STORE,
  claim: CLAIM,
  transaction: TRANSACTION,
  report: REPORT,
  review: REVIEW,
  alert: ALERT,
};

// Admin reports and the audit history name their target by type; its status reads from that type's domain.
const TARGET_DOMAINS: Record<string, StatusDomain> = {
  listing: "listing",
  listing_revision: "revision",
  store: "store",
  report: "report",
  review: "review",
};

export function statusDomainForTarget(targetType: string | null | undefined): StatusDomain | null {
  return (targetType && TARGET_DOMAINS[targetType]) || null;
}

export function statusEntry(domain: StatusDomain, status: string | null | undefined): StatusEntry {
  return (status && DICTIONARY[domain][status]) || { label: status ?? "Sin estado", tone: "neutral" };
}

export function statusLabel(domain: StatusDomain, status: string | null | undefined) {
  return statusEntry(domain, status).label;
}

// A store's standing: an active store that Laria verified reads "Tienda verificada".
export function storeStatusEntry(status: string | null | undefined, isVerified: boolean | null | undefined): StatusEntry {
  return status === "active" && isVerified ? { label: "Tienda verificada", tone: "accent", icon: "check" } : statusEntry("store", status);
}
