// big-09 "Pendientes" and stock-01 "Hoy en tu tienda": the account home opens on what needs the person, most urgent
// first, each item one tap from done. Read from get_account_pendientes() (one RPC, existing tables only).

export type PendienteAction =
  | { kind: "link"; href: string; label: string }
  | { kind: "purchase_check"; listingId: string }
  | { kind: "buyer_report"; checkinId: string; listingId: string; stockManaged: boolean }
  | { kind: "availability"; listingId: string; price: number | null }
  // talk-06 (maybes): a reservation ended; "Sí, se vendió" or "No, sigue disponible".
  | { kind: "reservation"; listingId: string };

export type Pendiente = {
  key: string;
  title: string;
  detail?: string;
  tone: "action" | "info";
  action: PendienteAction;
};

type Row = Record<string, unknown>;

export type PendientesData = {
  buyer: {
    pending_claims: { reference_id: string; title: string }[];
    reviews_due: { reference_id: string; title: string; deadline: string }[];
    purchase_checks: { listing_id: string; title: string; slug: string; contacted_at: string }[];
    price_drops: number;
    alert_matches: number;
  };
  seller: {
    rejected: { listing_id: string; title: string; reason: string | null; kind: "listing" | "revision" }[];
    admin_hidden: { listing_id: string; title: string; reason: string | null }[];
    drafts: { listing_id: string; title: string }[];
    buyer_reports: { checkin_id: string; listing_id: string; title: string; buyer_name: string | null; stock_managed: boolean }[];
    availability: { listing_id: string; title: string; slug: string; price_pen: number | null }[];
    unattributed: { listing_id: string; title: string; eligible: number }[];
    paused_until: string | null;
  };
  store: {
    inventory_enabled: boolean;
    out_of_stock_saved: number;
    low_stock: number;
    unlinked_skus: number;
    open_import: { id: string; file_name: string | null; expires_at: string } | null;
    purchase_requests_today: number;
    listings: number;
    payment_methods: number;
  } | null;
};

const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value ? value : null);
const count = (value: unknown) => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0);
const date = (value: unknown) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null);

function rows<T>(value: unknown, read: (row: Row) => T | null): T[] {
  return Array.isArray(value) ? value.flatMap((row) => (isRow(row) ? [read(row)].filter((item): item is T => item !== null) : [])) : [];
}

// Defensive: a malformed payload drops the bad rows; a failed call reads as null and the page says so.
export function parsePendientes(value: unknown): PendientesData | null {
  if (!isRow(value) || !isRow(value.buyer) || !isRow(value.seller)) return null;
  const { buyer, seller } = value;
  const store = isRow(value.store) ? value.store : null;
  const titled = (row: Row) => (text(row.listing_id) && text(row.title) ? { listing_id: row.listing_id as string, title: row.title as string } : null);
  return {
    buyer: {
      pending_claims: rows(buyer.pending_claims, (row) => (text(row.reference_id) && text(row.title) ? { reference_id: row.reference_id as string, title: row.title as string } : null)),
      reviews_due: rows(buyer.reviews_due, (row) => (text(row.reference_id) && text(row.title) && date(row.deadline) ? { reference_id: row.reference_id as string, title: row.title as string, deadline: row.deadline as string } : null)),
      purchase_checks: rows(buyer.purchase_checks, (row) => {
        const base = titled(row);
        return base && text(row.slug) && date(row.contacted_at) ? { ...base, slug: row.slug as string, contacted_at: row.contacted_at as string } : null;
      }),
      price_drops: count(buyer.price_drops),
      alert_matches: count(buyer.alert_matches),
    },
    seller: {
      rejected: rows(seller.rejected, (row) => {
        const base = titled(row);
        return base ? { ...base, reason: text(row.reason), kind: row.kind === "revision" ? "revision" as const : "listing" as const } : null;
      }),
      admin_hidden: rows(seller.admin_hidden, (row) => { const base = titled(row); return base ? { ...base, reason: text(row.reason) } : null; }),
      drafts: rows(seller.drafts, titled),
      buyer_reports: rows(seller.buyer_reports, (row) => {
        const base = titled(row);
        return base && text(row.checkin_id) ? { ...base, checkin_id: row.checkin_id as string, buyer_name: text(row.buyer_name), stock_managed: row.stock_managed === true } : null;
      }),
      availability: rows(seller.availability, (row) => {
        const base = titled(row);
        return base && text(row.slug) ? { ...base, slug: row.slug as string, price_pen: typeof row.price_pen === "number" ? row.price_pen : null } : null;
      }),
      unattributed: rows(seller.unattributed, (row) => { const base = titled(row); return base ? { ...base, eligible: count(row.eligible) } : null; }),
      paused_until: text(seller.paused_until),
    },
    store: store ? {
      inventory_enabled: store.inventory_enabled === true,
      out_of_stock_saved: count(store.out_of_stock_saved),
      low_stock: count(store.low_stock),
      unlinked_skus: count(store.unlinked_skus),
      open_import: isRow(store.open_import) && text(store.open_import.id) && date(store.open_import.expires_at)
        ? { id: store.open_import.id as string, file_name: text(store.open_import.file_name), expires_at: store.open_import.expires_at as string }
        : null,
      purchase_requests_today: count(store.purchase_requests_today),
      listings: count(store.listings),
      payment_methods: count(store.payment_methods),
    } : null,
  };
}

const DAY = 24 * 60 * 60 * 1000;

// "hoy", "mañana", "en 3 días": calendar days in Lima, so a deadline at 23:00 tomorrow reads "mañana".
export function daysUntil(deadline: string, now = new Date()) {
  const lima = (value: Date) => new Date(value.toLocaleString("en-US", { timeZone: "America/Lima" }));
  const start = lima(now);
  const end = lima(new Date(deadline));
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - start.getTime()) / DAY);
}

export function dueLabel(deadline: string, now = new Date()) {
  const days = daysUntil(deadline, now);
  return days <= 0 ? "vence hoy" : days === 1 ? "vence mañana" : `vence en ${days} días`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const quoted = (title: string) => `«${title}»`;

// talk-06: a Particular's reservations that ended (lib/listing-reservations.ts, read beside get_account_pendientes).
export type EndedReservation = { listing_id: string; title: string; watchers: number };

// The ordered list. Buyer and seller items apply to every account (a Particular buys and sells; a store owner can
// buy too); store items only to a store owner with a store.
export function buildPendientes(data: PendientesData, { now = new Date(), reservations = [] }: { now?: Date; reservations?: EndedReservation[] } = {}): Pendiente[] {
  const { buyer, seller, store } = data;
  const items: Pendiente[] = [];
  const push = (item: Pendiente) => items.push(item);

  for (const claim of buyer.pending_claims) push({
    key: `claim:${claim.reference_id}`, tone: "action", title: "Confirma tu compra",
    detail: `Quien vende indicó que compraste ${quoted(claim.title)}.`,
    action: { kind: "link", href: `/mi-cuenta/transacciones/${claim.reference_id}`, label: "Responder" },
  });
  for (const report of seller.buyer_reports) push({
    key: `report:${report.checkin_id}`, tone: "action",
    title: `${report.buyer_name ?? "Una persona"} dice que te compró ${quoted(report.title)}`,
    detail: report.stock_managed ? "El stock de esta publicación se controla en Inventario: registra la venta allí." : "Si es así, confírmalo y se abren las reseñas para ambos.",
    action: { kind: "buyer_report", checkinId: report.checkin_id, listingId: report.listing_id, stockManaged: report.stock_managed },
  });
  for (const review of buyer.reviews_due) push({
    key: `review:${review.reference_id}`, tone: "action", title: `Tu reseña ${dueLabel(review.deadline, now)}`,
    detail: quoted(review.title),
    action: { kind: "link", href: `/mi-cuenta/transacciones/${review.reference_id}`, label: "Reseñar" },
  });
  for (const listing of seller.rejected) push({
    key: `rejected:${listing.listing_id}:${listing.kind}`, tone: "action",
    title: listing.kind === "revision" ? "Corrige los cambios rechazados" : "Corrige tu publicación rechazada",
    detail: `${quoted(listing.title)}${listing.reason ? `. Motivo: ${listing.reason}` : ""}`,
    action: { kind: "link", href: `/mi-cuenta/publicaciones/${listing.listing_id}/editar`, label: "Corregir" },
  });
  for (const listing of seller.admin_hidden) push({
    key: `hidden:${listing.listing_id}`, tone: "info", title: `Moderación ocultó ${quoted(listing.title)}`,
    detail: listing.reason ? `Motivo: ${listing.reason}. Solo administración puede restaurarla.` : "Solo administración puede restaurarla.",
    action: { kind: "link", href: "/mi-cuenta/publicaciones?vista=accion", label: "Ver publicación" },
  });
  for (const check of buyer.purchase_checks) push({
    key: `check:${check.listing_id}`, tone: "action", title: `¿Compraste ${quoted(check.title)}?`,
    detail: "Le escribiste por WhatsApp hace unos días. Si lo compraste, se pueden habilitar las reseñas.",
    action: { kind: "purchase_check", listingId: check.listing_id },
  });
  for (const listing of seller.availability) push({
    key: `available:${listing.listing_id}`, tone: "action", title: `¿${quoted(listing.title)} sigue disponible?`,
    detail: "Responde en un toque y quienes buscan sabrán que pueden escribirte.",
    action: { kind: "availability", listingId: listing.listing_id, price: listing.price_pen },
  });
  for (const reservation of reservations) push({
    key: `reservation:${reservation.listing_id}`, tone: "action", title: `¿Se vendió ${quoted(reservation.title)}?`,
    detail: reservation.watchers
      ? `Terminó la reserva. ${plural(reservation.watchers, "persona espera", "personas esperan")} saber si se libera.`
      : "Terminó la reserva que marcaste. Respóndelo en un toque.",
    action: { kind: "reservation", listingId: reservation.listing_id },
  });
  for (const sale of seller.unattributed) push({
    key: `sale:${sale.listing_id}`, tone: "action", title: `¿A quién le vendiste ${quoted(sale.title)}?`,
    detail: `${plural(sale.eligible, "persona te escribió", "personas te escribieron")} por Laria. Elegir a quien compró habilita las reseñas.`,
    action: { kind: "link", href: `/mi-cuenta/transacciones/${sale.listing_id}`, label: "Elegir comprador" },
  });

  if (store) {
    if (store.purchase_requests_today) push({
      key: "store:requests", tone: "action", title: `${plural(store.purchase_requests_today, "solicitud de compra", "solicitudes de compra")} hoy`,
      action: { kind: "link", href: "/mi-cuenta/tienda/solicitudes", label: "Ver solicitudes" },
    });
    if (store.out_of_stock_saved) push({
      key: "store:saved-out", tone: "action", title: `${plural(store.out_of_stock_saved, "SKU agotado que la gente guardó", "SKU agotados que la gente guardó")}`,
      detail: "Reponer stock los vuelve a mostrar a quienes los guardaron.",
      action: { kind: "link", href: "/mi-cuenta/tienda/inventario?stock=out", label: "Ver agotados" },
    });
    if (store.low_stock) push({
      key: "store:low", tone: "info", title: `${plural(store.low_stock, "SKU con stock bajo", "SKU con stock bajo")}`,
      action: { kind: "link", href: "/mi-cuenta/tienda/inventario?stock=low", label: "Ver stock bajo" },
    });
    if (store.open_import) push({
      key: `store:import:${store.open_import.id}`, tone: "action", title: "Tienes una importación sin terminar",
      detail: `${store.open_import.file_name ? `${store.open_import.file_name}. ` : ""}Se descarta si no la retomas: ${dueLabel(store.open_import.expires_at, now)}.`,
      action: { kind: "link", href: `/mi-cuenta/tienda/inventario/importar/${store.open_import.id}`, label: "Retomar" },
    });
    if (store.unlinked_skus) push({
      key: "store:unlinked", tone: "info", title: `${plural(store.unlinked_skus, "SKU sin publicación", "SKU sin publicación")}`,
      detail: "Publicarlos los muestra en el catálogo con su stock.",
      action: { kind: "link", href: "/mi-cuenta/tienda/inventario?publicacion=none", label: "Ver SKU" },
    });
  }

  for (const draft of seller.drafts) push({
    key: `draft:${draft.listing_id}`, tone: "info", title: `Termina tu borrador ${quoted(draft.title)}`,
    action: { kind: "link", href: `/mi-cuenta/publicaciones/${draft.listing_id}/editar`, label: "Continuar" },
  });
  if (buyer.price_drops) push({
    key: "buyer:price-drops", tone: "info", title: `${plural(buyer.price_drops, "favorito bajó", "favoritos bajaron")} de precio`,
    action: { kind: "link", href: "/mi-cuenta/favoritos", label: "Ver favoritos" },
  });
  if (buyer.alert_matches) push({
    key: "buyer:alerts", tone: "info", title: `${plural(buyer.alert_matches, "publicación nueva", "publicaciones nuevas")} en tus alertas`,
    detail: "De los últimos 7 días.",
    action: { kind: "link", href: "/mi-cuenta/alertas", label: "Ver alertas" },
  });
  return items;
}

// shop-02: the steps that get a new store live. Each step ticks itself from the store's own data.
export type ChecklistStep = { key: string; label: string; done: boolean; href: string; hint?: string };

export function storeChecklist(store: {
  status: string; slug: string; logo_url: string | null; banner_url: string | null; description: string | null;
  instagram_url: string | null; facebook_url: string | null; tiktok_url: string | null; website_url: string | null;
} | null, { listings, paymentMethods, payments }: { listings: number; paymentMethods: number; payments: boolean }): ChecklistStep[] {
  const steps: ChecklistStep[] = [
    { key: "application", label: "Solicitud", done: Boolean(store), href: "/mi-cuenta/tienda", hint: store?.status === "pending" ? "En revisión: puedes avanzar con lo demás." : undefined },
    { key: "images", label: "Logo y portada", done: Boolean(store?.logo_url && store.banner_url), href: "/mi-cuenta/tienda" },
    { key: "profile", label: "Descripción y redes", done: Boolean(store?.description?.trim() && (store.instagram_url || store.facebook_url || store.tiktok_url || store.website_url)), href: "/mi-cuenta/tienda" },
    { key: "first", label: "Primera publicación o Importar desde Excel", done: listings > 0, href: "/mi-cuenta/tienda/publicar" },
  ];
  if (payments) steps.push({ key: "payments", label: "Medios de pago", done: paymentMethods > 0, href: "/mi-cuenta/tienda/medios-de-pago" });
  steps.push({ key: "page", label: "Ver tu página", done: store?.status === "active", href: store ? `/tiendas/${store.slug}` : "/mi-cuenta/tienda", hint: store?.status === "active" ? undefined : "Se publica cuando aprobamos la solicitud." });
  return steps;
}
