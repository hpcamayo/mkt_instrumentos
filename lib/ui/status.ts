// The one status dictionary (docs/ux-redesign/ux-1-foundations.md, decision D8). Only the visible label
// and its tone live here; meanings and transitions stay as in docs/functional-spec.md.
export type StatusTone = "neutral" | "accent" | "warning" | "danger" | "solid" | "line";
export type StatusIcon = "draft" | "review" | "check" | "reject" | "hidden" | "sold" | "archive" | "pause";
export type StatusEntry = { label: string; tone: StatusTone; icon?: StatusIcon };
export type StatusDomain = "listing" | "revision" | "store" | "claim" | "report" | "alert";

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

const CLAIM: Record<string, StatusEntry> = {
  pending: { label: "Comprador pendiente de confirmar", tone: "warning", icon: "review" },
  confirmed: { label: "Compra confirmada", tone: "accent", icon: "check" },
  declined: { label: "El contacto indicó que no fue comprador", tone: "danger", icon: "reject" },
  cancelled: { label: "Solicitud cancelada", tone: "neutral" },
  superseded: { label: "Solicitud reemplazada", tone: "neutral" },
  external: { label: "Venta fuera de Laria", tone: "neutral" },
};

const REPORT: Record<string, StatusEntry> = {
  open: { label: "Abierto", tone: "warning", icon: "review" },
  resolved: { label: "Resuelto", tone: "accent", icon: "check" },
  dismissed: { label: "Desestimado", tone: "neutral" },
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
  report: REPORT,
  alert: ALERT,
};

export function statusEntry(domain: StatusDomain, status: string | null | undefined): StatusEntry {
  return (status && DICTIONARY[domain][status]) || { label: status ?? "Sin estado", tone: "neutral" };
}

export function statusLabel(domain: StatusDomain, status: string | null | undefined) {
  return statusEntry(domain, status).label;
}
