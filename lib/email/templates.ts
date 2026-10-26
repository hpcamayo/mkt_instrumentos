import { formatPrice } from "@/lib/price";
import { searchAlertPath, searchAlertSummary, type SearchAlertFilters } from "@/lib/search-alerts";

type EmailListing = { title: string; slug: string; price_pen: number | null; image_url?: string | null };
type FollowItem = { slug: string; title: string; price_pen: number | null; image_url?: string | null; reason_label?: string | null };

export type MarketplaceEmailPayload = {
  delivery_id: string;
  event_type: string;
  attempt_count: number;
  recipient_email: string;
  recipient_name: string | null;
  // Accounts batch (save-07): who the e-mail is for, to sign its one-click links.
  recipient_user_id?: string;
  context: { reason?: string; old_price_pen?: number; new_price_pen?: number; digest_date?: string; week_start?: string; items?: FollowItem[]
    // Feature ideas, accounts batch (safe-08, safe-10, safe-02).
    device?: string; signed_in_at?: string; ticket_code?: string; answer?: string; report_code?: string; item?: string };
  listing: EmailListing | null;
  store: { name: string; slug: string } | null;
  transaction: { reference_id: string; listing_title: string; review_deadline: string | null } | null;
  search_alert: { id: string; name?: string | null; filters: SearchAlertFilters; frequency: "immediate" | "daily"; matches: EmailListing[] } | null;
};

type EmailItem = { title: string; price: number | null; previousPrice?: number | null; imageUrl?: string | null; path: string; note?: string | null };
type TemplateContent = { subject: string; heading: string; body: string; ctaLabel: string; path: string; details?: string[]; items?: EmailItem[] };

// save-07: e-mails a person can calm down. Alerts, price drops and the weekly digest are not transactional: they say
// why they arrived and carry one-click links (signed in lib/email/links.ts) and a link to the "Correos" settings.
export const OPTIONAL_EMAIL_TYPES = ["listing_price_drop", "search_alert_immediate", "search_alert_daily", "follow_weekly"] as const;
export type EmailFooterLink = { label: string; url: string };

export function renderMarketplaceEmail(payload: MarketplaceEmailPayload, baseUrl: string, links: EmailFooterLink[] = []) {
  const content = templateContent(payload);
  const destination = internalUrl(baseUrl, content.path);
  const optional = (OPTIONAL_EMAIL_TYPES as readonly string[]).includes(payload.event_type);
  const manageUrl = internalUrl(baseUrl, "/mi-cuenta/correos");
  const footerLinks = optional ? [...links, { label: "Elegir qué correos recibo", url: manageUrl }] : [];
  const footerText = optional
    ? `Recibes este correo porque ${whyText(payload.event_type)}.`
    : "Este es un correo transaccional de Laria.";
  const details = content.details?.length ? `<ul style="margin:20px 0;padding-left:22px;color:#4B5563">${content.details.map((detail) => `<li style="margin:8px 0">${escapeHtml(detail)}</li>`).join("")}</ul>` : "";
  const items = content.items?.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0">${content.items.map((item) => itemRow(item, baseUrl)).join("")}</table>` : "";
  const footerHtml = footerLinks.length ? `<p style="margin:10px 0 0">${footerLinks.map((link) => `<a href="${escapeHtml(link.url)}" style="color:#101217;text-decoration:underline">${escapeHtml(link.label)}</a>`).join(" &middot; ")}</p>` : "";
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F1F3F5;font-family:Arial,sans-serif;color:#101217"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E9EDF3;border-radius:8px;overflow:hidden"><tr><td style="background:#050608;padding:22px 28px"><strong style="font-size:24px;color:#F1EA16">Laria</strong><div style="margin-top:4px;color:#9DA3AF;font-size:13px">El mercado de instrumentos del Perú</div></td></tr><tr><td style="padding:28px"><h1 style="margin:0;font-size:26px;line-height:1.2">${escapeHtml(content.heading)}</h1><p style="margin:16px 0 0;line-height:1.6;color:#4B5563">${escapeHtml(content.body)}</p>${details}${items}<p style="margin:24px 0"><a href="${escapeHtml(destination)}" style="display:inline-block;background:#F1EA16;color:#050608;text-decoration:none;font-weight:700;padding:13px 18px;border-radius:6px">${escapeHtml(content.ctaLabel)}</a></p><p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#4B5563">Si el botón no funciona, abre este enlace:<br><a href="${escapeHtml(destination)}" style="color:#101217;text-decoration:underline;text-decoration-color:#6BA6FF;word-break:break-all">${escapeHtml(destination)}</a></p></td></tr><tr><td style="border-top:1px solid #E9EDF3;padding:18px 28px;font-size:12px;line-height:1.5;color:#4B5563">${escapeHtml(footerText)} Laria no procesa pagos, envíos ni garantiza el equipo ni las transacciones.${footerHtml}</td></tr></table></td></tr></table></body></html>`;
  const text = [
    `Laria`, content.heading, content.body,
    ...(content.details ?? []).map((detail) => `- ${detail}`),
    ...(content.items ?? []).map((item) => `- ${itemText(item)}: ${internalUrl(baseUrl, item.path)}`),
    `${content.ctaLabel}: ${destination}`,
    `${footerText} Laria no procesa pagos, envíos ni garantiza el equipo ni las transacciones.`,
    ...footerLinks.map((link) => `${link.label}: ${link.url}`),
  ].join("\n\n");
  return { subject: content.subject, html, text, destination };
}

export function parseMarketplaceEmailPayload(value: unknown): MarketplaceEmailPayload | null {
  if (!isRecord(value) || !isString(value.delivery_id) || !isString(value.event_type)
    || !Number.isInteger(value.attempt_count) || !isString(value.recipient_email)
    || !(value.recipient_name === null || typeof value.recipient_name === "string") || !isRecord(value.context)
    || !(value.recipient_user_id === undefined || typeof value.recipient_user_id === "string")) return null;
  if (value.context.items !== undefined && !(Array.isArray(value.context.items) && value.context.items.every((item) => parseListing(item)))) return null;
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
    // POST 15 (selling batch): the approval is the moment it goes live, so the button opens the listing itself.
    case "listing_approved": return listing?.slug
      ? { ...listingTemplate("Tu publicación está en línea", `“${listing.title}” ya aparece en Laria y los compradores pueden escribirte por WhatsApp.`, "Ver tu publicación", `/instrumentos/${listing.slug}`), details: ["Para que la vean más personas, comparte el enlace en tus grupos o redes."] }
      : listingTemplate("Tu publicación está en línea", "Tu publicación ya aparece en Laria.", "Ver mis publicaciones", "/mi-cuenta/publicaciones");
    case "listing_rejected": return listingTemplate("Tu publicación necesita correcciones", `“${listing?.title ?? "Tu publicación"}” fue rechazada.${reason ? ` Motivo: ${reason}` : ""}`, "Corregir publicación", editPath(listing));
    case "listing_hidden": return listingTemplate("Moderación ocultó tu publicación", `“${listing?.title ?? "Tu publicación"}” dejó de estar visible.${reason ? ` Motivo: ${reason}` : ""}`, "Revisar publicación", "/mi-cuenta/publicaciones");
    case "listing_revision_approved": return listingTemplate("Tus cambios fueron aprobados", `La actualización de “${listing?.title ?? "tu publicación"}” fue aprobada.`, "Ver mis publicaciones", "/mi-cuenta/publicaciones");
    case "listing_revision_rejected": return listingTemplate("Tu actualización necesita correcciones", `Los cambios de “${listing?.title ?? "tu publicación"}” fueron rechazados; la versión publicada sigue visible.${reason ? ` Motivo: ${reason}` : " Revisa el motivo en tu cuenta."}`, "Corregir cambios", editPath(listing));
    // ux my-listings (big-08, mine-08, trust-01): reminders from laria_private.run_my_listings_reminders().
    case "listing_purchase_check": return listingTemplate(`¿Compraste “${listing?.title ?? "el equipo"}”?`, "Le escribiste a quien vende hace unos días. Si lo compraste, respóndelo en un toque y se habilitan las reseñas para ambos. Si no, también puedes decirlo.", "Responder", "/mi-cuenta");
    case "listing_buyer_reported_purchase": return listingTemplate("Una persona dice que te compró", `Quien te escribió por “${listing?.title ?? "tu publicación"}” indica que lo compró. Confírmalo para marcarla vendida y abrir las reseñas.`, "Revisar", "/mi-cuenta");
    case "listing_availability_checkin": return listingTemplate(`¿“${listing?.title ?? "Tu publicación"}” sigue disponible?`, "Respóndelo en un toque: confirmar, marcar vendida o ajustar el precio.", "Responder", "/mi-cuenta");
    case "listing_purchase_confirmation_reminder": return transactionTemplate("Confirma tu compra", `Quien vende indicó que compraste “${transaction?.listing_title ?? listing?.title ?? "el equipo"}”. Responde desde tu cuenta de Laria para habilitar las reseñas.`, "Responder", transaction);
    case "listing_review_reminder": return transactionTemplate("Tu reseña vence pronto", `El plazo para reseñar la compra de “${transaction?.listing_title ?? listing?.title ?? "el equipo"}” termina pronto. Es breve y ayuda a la próxima persona.`, "Reseñar", transaction);
    // end ux my-listings
    case "store_approved": return storeTemplate("Tu solicitud fue aprobada", `${store?.name ?? "Tu negocio"} ya figura como Tienda en Laria.`, "Administrar mi tienda");
    case "store_rejected": return storeTemplate("Tu solicitud de tienda necesita correcciones", `${store?.name ?? "Tu solicitud"} fue rechazada.${reason ? ` Motivo: ${reason}` : ""}`, "Revisar solicitud");
    case "store_verified": return storeTemplate("Tu tienda fue verificada", `${store?.name ?? "Tu tienda"} ahora figura como Tienda verificada: sus publicaciones nuevas aparecen directamente si cumplen las reglas.`, "Ver mi tienda");
    case "store_verification_revoked": return storeTemplate("Cambió la verificación de tu tienda", `${store?.name ?? "Tu tienda"} continúa activa como Tienda, pero el inventario nuevo vuelve a requerir moderación.`, "Ver mi tienda");
    case "transaction_confirmation_requested": return transactionTemplate("¿Compraste este equipo?", `El vendedor indicó que compraste “${transaction?.listing_title ?? listing?.title ?? "este equipo"}”. Confirma solo desde tu cuenta de Laria.`, "Responder solicitud", transaction);
    case "transaction_confirmed": return transactionTemplate("La compra fue reconocida por ambas partes", `La relación vinculada a “${transaction?.listing_title ?? listing?.title ?? "el equipo"}” fue confirmada. Se abrió el plazo de 10 días para reseñar. Esto no verifica pago ni entrega.`, "Ver compra y reseñas", transaction);
    case "transaction_declined": return transactionTemplate("El contacto no confirmó la compra", `El contacto seleccionado indicó que no compró “${transaction?.listing_title ?? listing?.title ?? "el equipo"}”.`, "Revisar venta", transaction);
    case "transaction_cancelled": return transactionTemplate("La solicitud de compra fue cancelada", `El vendedor canceló la solicitud relacionada con “${transaction?.listing_title ?? listing?.title ?? "el equipo"}”.`, "Ver compras", transaction);
    case "review_revealed": return transactionTemplate("Tus reseñas ya están visibles", `Ambas partes enviaron su reseña sobre “${transaction?.listing_title ?? listing?.title ?? "la transacción"}”. Ya puedes verlas en Laria.`, "Ver reseñas", transaction);
    case "listing_price_drop": return {
      subject: "Bajó de precio una publicación que guardaste",
      heading: "Un favorito bajó de precio",
      body: `“${listing?.title ?? "Una publicación guardada"}” cambió de ${formatPrice(payload.context.old_price_pen ?? 0)} a ${formatPrice(payload.context.new_price_pen ?? 0)}. La baja refleja el precio publicado por el vendedor; Laria no certifica descuentos.`,
      ctaLabel: "Ver publicación",
      path: listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/favoritos",
      items: listing ? [{ title: listing.title, price: payload.context.new_price_pen ?? listing.price_pen, previousPrice: payload.context.old_price_pen ?? null, imageUrl: listing.image_url, path: `/instrumentos/${listing.slug}` }] : undefined,
    };
    case "search_alert_immediate": return {
      subject: "Nueva publicación para tu alerta en Laria",
      heading: "Encontramos una nueva coincidencia",
      body: `“${listing?.title ?? "Una publicación nueva"}” coincide con tu búsqueda guardada: ${payload.search_alert ? alertLabel(payload.search_alert) : "tu alerta"}.`,
      ctaLabel: "Ver publicación",
      path: listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/alertas",
      items: listing ? [{ title: listing.title, price: listing.price_pen, imageUrl: listing.image_url, path: `/instrumentos/${listing.slug}` }] : undefined,
    };
    case "search_alert_daily": return dailyTemplate(payload);
    // big-11: someone asked a public question on the seller's listing; the seller answers it on the listing.
    case "listing_question_asked": return {
      subject: "Te hicieron una pregunta en Laria",
      heading: "Tienes una pregunta nueva",
      body: `Alguien preguntó en “${listing?.title ?? "tu publicación"}”. Respóndela en la publicación: la respuesta queda visible para todos y ayuda a quien viene después.`,
      ctaLabel: "Responder",
      path: listing ? `/instrumentos/${listing.slug}#preguntas` : "/mi-cuenta/notificaciones",
    };
    // list-11: the buyer asked "Avísame cuando vuelva" on an Agotado listing; sent once.
    case "listing_back_in_stock": return {
      subject: "Volvió a estar disponible en Laria",
      heading: "Lo que esperabas volvió",
      body: `“${listing?.title ?? "La publicación que guardaste"}” vuelve a tener unidades. Te avisamos una sola vez, como pediste.`,
      ctaLabel: "Ver publicación",
      path: listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/notificaciones",
    };
    case "follow_weekly": return followTemplate(payload);
    // Feature ideas, accounts batch. All four are transactional: they are about the person's own account or request.
    // safe-08: a sign-in from a browser this account had not used before.
    case "account_new_device": return {
      subject: "Nuevo ingreso a tu cuenta de Laria",
      heading: "Ingresaste desde un dispositivo nuevo",
      body: "Si fuiste tú, no tienes que hacer nada. Si no reconoces este ingreso, cierra esa sesión desde Seguridad y cambia tu contraseña.",
      details: [`Dispositivo: ${payload.context.device ?? "Navegador"}`, ...(payload.context.signed_in_at ? [`Fecha: ${payload.context.signed_in_at} (hora de Lima)`] : [])],
      ctaLabel: "Revisar mis dispositivos",
      path: "/mi-cuenta/seguridad#dispositivos",
    };
    // safe-08: a recovery code replaced the authenticator app.
    case "account_two_step_reset": return {
      subject: "Usaste un código de recuperación en Laria",
      heading: "Desactivamos tu app de autenticación",
      body: "Alguien ingresó a tu cuenta con uno de tus códigos de recuperación, así que quitamos la app de autenticación y cerramos tus sesiones. Si fuiste tú, vuelve a configurarla. Si no, cambia tu contraseña ahora y escríbenos desde el Centro de ayuda.",
      details: payload.context.signed_in_at ? [`Fecha: ${payload.context.signed_in_at} (hora de Lima)`] : undefined,
      ctaLabel: "Configurar de nuevo",
      path: "/mi-cuenta/seguridad?paso=activar",
    };
    // safe-10: Admin answered a question sent from the help center.
    case "help_ticket_answered": return {
      subject: `Respondimos tu consulta ${payload.context.ticket_code ?? ""}`.trim(),
      heading: "Tenemos una respuesta para ti",
      body: payload.context.answer ?? "Respondimos tu consulta en el Centro de ayuda.",
      details: payload.context.ticket_code ? [`Consulta ${payload.context.ticket_code}`] : undefined,
      ctaLabel: "Ver mis consultas",
      path: "/ayuda/mis-consultas",
    };
    // safe-02: Admin confirmed that a listing or an item matches the person's report. The wording never accuses anyone,
    // and the e-mail does not name the listing or who publishes it.
    case "stolen_report_match": return {
      subject: "Hay una coincidencia con tu reporte en Laria",
      heading: "Una publicación coincide con tu reporte",
      body: `El equipo de Laria revisó un equipo que coincide con tu reporte${payload.context.item ? ` de ${payload.context.item}` : ""}. Coincidir no prueba nada por sí solo. Si tienes una denuncia policial, comparte el código del reporte con la policía; Laria colabora con las autoridades cuando lo piden por los canales oficiales.`,
      details: payload.context.report_code ? [`Reporte ${payload.context.report_code}`] : undefined,
      ctaLabel: "Ver mis reportes",
      path: "/reportar-robo/mis-reportes",
    };
    default: throw new Error("EMAIL_TEMPLATE_UNSUPPORTED");
  }
}

// Rejection e-mails open the edit form itself (by slug: the payload has no listing id).
function editPath(listing: MarketplaceEmailPayload["listing"]) {
  return listing ? `/mi-cuenta/publicaciones/editar/${encodeURIComponent(listing.slug)}` : "/mi-cuenta/publicaciones";
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
    body: `Nuevas publicaciones para: ${alertLabel(alert)}.`,
    ctaLabel: "Abrir búsqueda",
    path: searchAlertPath(alert.filters),
    items: matches.map((match) => ({ title: match.title, price: match.price_pen, imageUrl: match.image_url, path: `/instrumentos/${match.slug}` })),
  };
}
function followTemplate(payload: MarketplaceEmailPayload): TemplateContent {
  const items = payload.context.items ?? [];
  if (!items.length) throw new Error("EMAIL_EMPTY_DIGEST");
  return {
    subject: `${items.length} ${items.length === 1 ? "novedad" : "novedades"} de lo que sigues en Laria`,
    heading: "Lo nuevo de lo que sigues",
    body: "Estas publicaciones aparecieron esta semana en las tiendas y marcas que sigues.",
    ctaLabel: "Ver todo en Laria",
    path: "/mi-cuenta/favoritos",
    items: items.map((item) => ({ title: item.title, price: item.price_pen, imageUrl: item.image_url, path: `/instrumentos/${item.slug}`, note: item.reason_label ? `De ${item.reason_label}` : null })),
  };
}
function alertLabel(alert: NonNullable<MarketplaceEmailPayload["search_alert"]>) {
  return alert.name?.trim() ? `«${alert.name.trim()}»` : searchAlertSummary(alert.filters);
}
function whyText(eventType: string) {
  if (eventType === "listing_price_drop") return "guardaste esta publicación en favoritos";
  if (eventType === "follow_weekly") return "elegiste recibir el resumen semanal de lo que sigues";
  return "creaste una alerta de búsqueda en Laria";
}
function itemText(item: EmailItem) {
  const price = item.price === null ? "" : ` · ${item.previousPrice ? `antes ${formatPrice(item.previousPrice)}, ahora ` : ""}${formatPrice(item.price)}`;
  return `${item.title}${price}${item.note ? ` · ${item.note}` : ""}`;
}
function itemRow(item: EmailItem, baseUrl: string) {
  const url = escapeHtml(internalUrl(baseUrl, item.path));
  const image = item.imageUrl && /^https:\/\//.test(item.imageUrl)
    ? `<td width="96" style="padding:8px 12px 8px 0;vertical-align:top"><a href="${url}"><img src="${escapeHtml(item.imageUrl)}" width="96" height="72" alt="" style="display:block;width:96px;height:72px;object-fit:cover;border-radius:6px;border:0"></a></td>`
    : "";
  const previous = item.previousPrice && item.price !== null ? `<span style="color:#4B5563;text-decoration:line-through">${escapeHtml(formatPrice(item.previousPrice))}</span> ` : "";
  const price = item.price === null ? "" : `<div style="margin-top:4px;font-weight:700">${previous}${escapeHtml(formatPrice(item.price))}</div>`;
  const note = item.note ? `<div style="margin-top:4px;font-size:13px;color:#4B5563">${escapeHtml(item.note)}</div>` : "";
  return `<tr>${image}<td style="padding:8px 0;vertical-align:top;border-bottom:1px solid #E9EDF3"><a href="${url}" style="color:#101217;font-weight:700;text-decoration:none">${escapeHtml(item.title)}</a>${price}${note}</td></tr>`;
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
  if (!isRecord(value) || !isString(value.title) || !isString(value.slug) || !(value.price_pen === null || typeof value.price_pen === "number")
    || !(value.image_url === undefined || value.image_url === null || typeof value.image_url === "string")) return undefined;
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
  if (!isRecord(value) || !isString(value.id) || !isRecord(value.filters) || !["immediate", "daily"].includes(String(value.frequency)) || !Array.isArray(value.matches)
    || !(value.name === undefined || value.name === null || typeof value.name === "string")) return undefined;
  const matches = value.matches.map(parseListing);
  if (matches.some((match) => !match)) return undefined;
  return { ...value, matches } as MarketplaceEmailPayload["search_alert"];
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
