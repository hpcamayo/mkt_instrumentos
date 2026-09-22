import { formatPrice } from "@/lib/price";
import { searchAlertPath, searchAlertSummary, type SearchAlertFilters } from "@/lib/search-alerts";

export type MarketplaceEmailPayload = {
  delivery_id: string;
  event_type: string;
  attempt_count: number;
  recipient_email: string;
  recipient_name: string | null;
  context: { reason?: string; old_price_pen?: number; new_price_pen?: number; digest_date?: string };
  listing: { title: string; slug: string; price_pen: number | null } | null;
  store: { name: string; slug: string } | null;
  transaction: { reference_id: string; listing_title: string; review_deadline: string | null } | null;
  search_alert: { id: string; filters: SearchAlertFilters; frequency: "immediate" | "daily"; matches: Array<{ title: string; slug: string; price_pen: number | null }> } | null;
};

type TemplateContent = { subject: string; heading: string; body: string; ctaLabel: string; path: string; details?: string[] };

export function renderMarketplaceEmail(payload: MarketplaceEmailPayload, baseUrl: string) {
  const content = templateContent(payload);
  const destination = internalUrl(baseUrl, content.path);
  const details = content.details?.length ? `<ul style="margin:20px 0;padding-left:22px;color:#3f4652">${content.details.map((detail) => `<li style="margin:8px 0">${escapeHtml(detail)}</li>`).join("")}</ul>` : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#101217"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #d9dde4;border-radius:12px;overflow:hidden"><tr><td style="background:#101217;padding:22px 28px"><strong style="font-size:24px;color:#ffd43b">Laria</strong><div style="margin-top:4px;color:#d9dde4;font-size:13px">Instrumentos y equipos musicales en Perú</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0;font-size:26px;line-height:1.2">${escapeHtml(content.heading)}</h1><p style="margin:16px 0 0;line-height:1.6;color:#3f4652">${escapeHtml(content.body)}</p>${details}<p style="margin:24px 0"><a href="${escapeHtml(destination)}" style="display:inline-block;background:#ffd43b;color:#101217;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:7px">${escapeHtml(content.ctaLabel)}</a></p><p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#667085">Si el botón no funciona, abre este enlace:<br><a href="${escapeHtml(destination)}" style="color:#175cd3;word-break:break-all">${escapeHtml(destination)}</a></p></td></tr><tr><td style="border-top:1px solid #e5e7eb;padding:18px 28px;font-size:12px;line-height:1.5;color:#667085">Este es un correo transaccional de Laria. Laria no procesa pagos, envíos ni garantiza productos o transacciones.</td></tr></table></td></tr></table></body></html>`;
  const text = [`Laria`, content.heading, content.body, ...(content.details ?? []).map((detail) => `- ${detail}`), `${content.ctaLabel}: ${destination}`, "Laria no procesa pagos, envíos ni garantiza productos o transacciones."].join("\n\n");
  return { subject: content.subject, html, text, destination };
}

export function parseMarketplaceEmailPayload(value: unknown): MarketplaceEmailPayload | null {
  if (!isRecord(value) || !isString(value.delivery_id) || !isString(value.event_type)
    || !Number.isInteger(value.attempt_count) || !isString(value.recipient_email)
    || !(value.recipient_name === null || typeof value.recipient_name === "string") || !isRecord(value.context)) return null;
  const listing = parseListing(value.listing);
  const store = parseStore(value.store);
  const transaction = parseTransaction(value.transaction);
  const searchAlert = parseSearchAlert(value.search_alert);
  if (listing === undefined || store === undefined || transaction === undefined || searchAlert === undefined) return null;
  return { ...value, listing, store, transaction, search_alert: searchAlert } as MarketplaceEmailPayload;
}

function templateContent(payload: MarketplaceEmailPayload): TemplateContent {
  const listing = payload.listing;
  const store = payload.store;
  const transaction = payload.transaction;
  const reason = payload.context.reason;
  switch (payload.event_type) {
    case "listing_approved": return listingTemplate("Tu publicación fue aprobada", `“${listing?.title ?? "Tu publicación"}” ya puede mostrarse en Laria.`, "Ver mis publicaciones", "/mi-cuenta/publicaciones");
    case "listing_rejected": return listingTemplate("Tu publicación necesita correcciones", `“${listing?.title ?? "Tu publicación"}” fue rechazada.${reason ? ` Motivo: ${reason}` : ""}`, "Revisar publicación", "/mi-cuenta/publicaciones");
    case "listing_hidden": return listingTemplate("Moderación ocultó tu publicación", `“${listing?.title ?? "Tu publicación"}” dejó de estar visible.${reason ? ` Motivo: ${reason}` : ""}`, "Revisar publicación", "/mi-cuenta/publicaciones");
    case "listing_revision_approved": return listingTemplate("Tus cambios fueron aprobados", `La actualización de “${listing?.title ?? "tu publicación"}” fue aprobada.`, "Ver mis publicaciones", "/mi-cuenta/publicaciones");
    case "listing_revision_rejected": return listingTemplate("Tu actualización necesita correcciones", `La propuesta de cambios para “${listing?.title ?? "tu publicación"}” fue rechazada. Revisa el motivo en tu cuenta.`, "Revisar publicación", "/mi-cuenta/publicaciones");
    case "store_approved": return storeTemplate("Tu solicitud fue aprobada", `${store?.name ?? "Tu negocio"} ya figura como Tienda en Laria.`, "Administrar mi tienda");
    case "store_rejected": return storeTemplate("Tu solicitud de tienda necesita correcciones", `${store?.name ?? "Tu solicitud"} fue rechazada.${reason ? ` Motivo: ${reason}` : ""}`, "Revisar solicitud");
    case "store_verified": return storeTemplate("Tu tienda fue verificada", `${store?.name ?? "Tu tienda"} ahora figura como Tienda Verificada y su inventario válido nuevo puede publicarse directamente.`, "Ver mi tienda");
    case "store_verification_revoked": return storeTemplate("Cambió la verificación de tu tienda", `${store?.name ?? "Tu tienda"} continúa activa como Tienda, pero el inventario nuevo vuelve a requerir moderación.`, "Ver mi tienda");
    case "transaction_confirmation_requested": return transactionTemplate("¿Compraste este artículo?", `El vendedor indicó que compraste “${transaction?.listing_title ?? listing?.title ?? "este artículo"}”. Confirma solo desde tu cuenta de Laria.`, "Responder solicitud", transaction);
    case "transaction_confirmed": return transactionTemplate("La compra fue reconocida por ambas partes", `La relación vinculada a “${transaction?.listing_title ?? listing?.title ?? "el artículo"}” fue confirmada. Se abrió el plazo de 10 días para reseñar. Esto no verifica pago ni entrega.`, "Ver compra y reseñas", transaction);
    case "transaction_declined": return transactionTemplate("El contacto no confirmó la compra", `El contacto seleccionado indicó que no compró “${transaction?.listing_title ?? listing?.title ?? "el artículo"}”.`, "Revisar venta", transaction);
    case "transaction_cancelled": return transactionTemplate("La solicitud de compra fue cancelada", `El vendedor canceló la solicitud relacionada con “${transaction?.listing_title ?? listing?.title ?? "el artículo"}”.`, "Ver compras", transaction);
    case "review_revealed": return transactionTemplate("Tus reseñas ya están visibles", `Ambas partes enviaron su reseña sobre “${transaction?.listing_title ?? listing?.title ?? "la transacción"}”. Ya puedes verlas en Laria.`, "Ver reseñas", transaction);
    case "listing_price_drop": return {
      subject: "Bajó de precio un producto que guardaste",
      heading: "Un favorito bajó de precio",
      body: `“${listing?.title ?? "Un producto guardado"}” cambió de ${formatPrice(payload.context.old_price_pen ?? 0)} a ${formatPrice(payload.context.new_price_pen ?? 0)}. La baja refleja el precio publicado por el vendedor; Laria no certifica descuentos.`,
      ctaLabel: "Ver publicación",
      path: listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/favoritos",
    };
    case "search_alert_immediate": return {
      subject: "Nueva publicación para tu alerta en Laria",
      heading: "Encontramos una nueva coincidencia",
      body: `“${listing?.title ?? "Una publicación nueva"}” coincide con tu búsqueda guardada: ${payload.search_alert ? searchAlertSummary(payload.search_alert.filters) : "tu alerta"}.`,
      ctaLabel: "Ver publicación",
      path: listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/alertas",
    };
    case "search_alert_daily": return dailyTemplate(payload);
    default: throw new Error("EMAIL_TEMPLATE_UNSUPPORTED");
  }
}

function listingTemplate(heading: string, body: string, ctaLabel: string, path: string): TemplateContent {
  return { subject: heading, heading, body, ctaLabel, path };
}
function storeTemplate(heading: string, body: string, ctaLabel: string): TemplateContent {
  return { subject: heading, heading, body, ctaLabel, path: "/mi-cuenta/tienda" };
}
function transactionTemplate(heading: string, body: string, ctaLabel: string, transaction: MarketplaceEmailPayload["transaction"]): TemplateContent {
  return { subject: heading, heading, body, ctaLabel, path: transaction ? `/mi-cuenta/transacciones/${transaction.reference_id}` : "/mi-cuenta/transacciones" };
}
function dailyTemplate(payload: MarketplaceEmailPayload): TemplateContent {
  const alert = payload.search_alert;
  const matches = alert?.matches ?? [];
  if (!alert || !matches.length) throw new Error("EMAIL_EMPTY_DIGEST");
  return {
    subject: `${matches.length} ${matches.length === 1 ? "nueva coincidencia" : "nuevas coincidencias"} en Laria`,
    heading: "Resumen diario de tu alerta",
    body: `Nuevas publicaciones para: ${searchAlertSummary(alert.filters)}.`,
    ctaLabel: "Abrir búsqueda",
    path: searchAlertPath(alert.filters),
    details: matches.map((match) => `${match.title}${match.price_pen === null ? "" : ` · ${formatPrice(match.price_pen)}`}`),
  };
}

function internalUrl(baseUrl: string, path: string) {
  const base = new URL(baseUrl);
  if (!/^https?:$/.test(base.protocol) || base.username || base.password) throw new Error("EMAIL_BASE_URL_INVALID");
  const destination = new URL(path, base);
  if (destination.origin !== base.origin) throw new Error("EMAIL_DESTINATION_INVALID");
  return destination.toString();
}
function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
function parseListing(value: unknown): MarketplaceEmailPayload["listing"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.title) || !isString(value.slug) || !(value.price_pen === null || typeof value.price_pen === "number")) return undefined;
  return value as MarketplaceEmailPayload["listing"];
}
function parseStore(value: unknown): MarketplaceEmailPayload["store"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.name) || !isString(value.slug)) return undefined;
  return value as MarketplaceEmailPayload["store"];
}
function parseTransaction(value: unknown): MarketplaceEmailPayload["transaction"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.reference_id) || !isString(value.listing_title) || !(value.review_deadline === null || typeof value.review_deadline === "string")) return undefined;
  return value as MarketplaceEmailPayload["transaction"];
}
function parseSearchAlert(value: unknown): MarketplaceEmailPayload["search_alert"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isString(value.id) || !isRecord(value.filters) || !["immediate", "daily"].includes(String(value.frequency)) || !Array.isArray(value.matches)) return undefined;
  const matches = value.matches.map(parseListing);
  if (matches.some((match) => !match)) return undefined;
  return { ...value, matches } as MarketplaceEmailPayload["search_alert"];
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
