// What each notification is called and which page it opens. Shared by Mi cuenta > Notificaciones
// (components/notifications-list.tsx) and the push notices (lib/push/notice.ts, big-12), so a push reads and opens
// like its row in the list. Plain module: server code (the push worker) and the client list both import it.

export type NotificationTarget = {
  event_type: string;
  listing_id: string | null;
  store_id: string | null;
  claim_id?: string | null;
  transaction_id?: string | null;
};

const NOTIFICATION_LABELS: Record<string, string> = {
  listing_price_drop: "Bajó de precio un favorito",
  listing_alert_match: "Nueva coincidencia de tu alerta",
  listing_approved: "Publicación aprobada",
  listing_rejected: "Publicación rechazada",
  listing_hidden: "Publicación ocultada",
  listing_revision_approved: "Cambios aprobados",
  listing_revision_rejected: "Cambios rechazados",
  store_approved: "Tienda aprobada",
  store_rejected: "Solicitud rechazada",
  store_verified: "Tienda verificada",
  store_verification_revoked: "Verificación revocada",
  // Effortless Laria, inventory batch, stock-06.
  store_stock_summary: "Resumen de stock",
  transaction_confirmation_requested: "Confirma una compra",
  transaction_confirmed: "Transacción confirmada",
  transaction_declined: "Confirmación rechazada",
  transaction_cancelled: "Solicitud cancelada",
  review_revealed: "Reseñas disponibles",
  listing_question_asked: "Te hicieron una pregunta",
  listing_question_answered: "Respondieron tu pregunta",
  listing_back_in_stock: "Volvió a estar disponible",
  // ux my-listings
  listing_purchase_check: "¿Lo compraste?",
  listing_buyer_reported_purchase: "Te reportaron una compra",
  listing_availability_checkin: "¿Sigue disponible?",
  listing_purchase_confirmation_reminder: "Confirma una compra",
  listing_review_reminder: "Tu reseña vence pronto",
  // feature-ideas services (bet-02)
  service_approved: "Servicio publicado",
  service_rejected: "Servicio por corregir",
  service_hidden: "Servicio ocultado",
  service_booking_requested: "Confirma una contratación",
  service_booking_confirmed: "Contratación confirmada",
  service_booking_declined: "Contratación no confirmada",
  service_review_received: "Nueva reseña de tu servicio",
  // Feature ideas, selling-tools batch.
  listing_price_step: "Bajada automática",
  listing_private_offer: "Oferta de un favorito",
  listing_consignment_update: "Consignación",
  store_trade_request: "Pedido de oferta",
  store_trade_update: "Novedad en Ofertas",
  gear_trade_offer: "Te enviaron una oferta",
  gear_trade_update: "Novedad de tu pedido",
  gear_reminder_due: "Recordatorio de Mi equipo",
  // /Feature ideas, selling-tools batch
};

export const DEFAULT_NOTIFICATION_LABEL = "Actualización de tu cuenta";

export function notificationLabel(eventType: string) {
  return NOTIFICATION_LABELS[eventType] ?? DEFAULT_NOTIFICATION_LABEL;
}

// ux my-listings: these are answered from Pendientes on the account home.
export const MY_LISTINGS_HOME_EVENTS = new Set(["listing_purchase_check", "listing_buyer_reported_purchase", "listing_availability_checkin"]);

// big-11: a question on the seller's listing, or the answer to the buyer's question, opens the listing's "Preguntas".
export function isQuestionNotification(eventType: string) {
  return eventType === "listing_question_asked" || eventType === "listing_question_answered";
}

// listingSlug: the list passes the public listing's address it looked up for an alert match (null when the listing is
// no longer public, which opens the alerts instead); a push leaves it out and links the listing by id, which the
// listing page forwards to its address.
export function notificationHref(notification: NotificationTarget, listingSlug?: string | null) {
  // Feature ideas, selling-tools batch.
  const selling = sellingNotificationHref(notification);
  if (selling) return selling;
  // /Feature ideas, selling-tools batch
  const transactionReference = notification.transaction_id ?? notification.claim_id;
  // feature-ideas services (bet-02): every service notice opens Mi cuenta › Servicios (bookings at their section).
  if (notification.event_type.startsWith("service_")) {
    return notification.event_type.startsWith("service_booking_") ? "/mi-cuenta/servicios#contrataciones" : "/mi-cuenta/servicios";
  }
  return transactionReference
    ? `/mi-cuenta/transacciones/${transactionReference}`
    : notification.event_type === "listing_alert_match"
    ? listingSlug ? `/instrumentos/${listingSlug}` : listingSlug === undefined && notification.listing_id ? `/instrumentos/${notification.listing_id}` : "/mi-cuenta/alertas"
    // ux my-listings: these are answered from Pendientes on the account home; rejections open the edit form.
    : MY_LISTINGS_HOME_EVENTS.has(notification.event_type)
    ? "/mi-cuenta"
    : (notification.event_type === "listing_rejected" || notification.event_type === "listing_revision_rejected") && notification.listing_id
    ? `/mi-cuenta/publicaciones/${notification.listing_id}/editar`
    : notification.event_type === "listing_price_drop" && notification.listing_id
    ? `/mi-cuenta/favoritos/${notification.listing_id}`
    : isQuestionNotification(notification.event_type) && notification.listing_id
    ? `/instrumentos/${notification.listing_id}#preguntas`
    : notification.event_type === "listing_back_in_stock" && notification.listing_id
    ? `/instrumentos/${notification.listing_id}`
    : notification.event_type === "store_stock_summary"
    ? "/mi-cuenta/tienda/inventario?stock=low"
    : notification.store_id && notification.event_type.startsWith("store_")
    ? "/mi-cuenta/tienda"
    : notification.store_id
      ? "/mi-cuenta/tienda/inventario"
      : "/mi-cuenta/publicaciones";
}

// Feature ideas, selling-tools batch (docs/feature-ideas/selling-tools.md): requests and offers open their inbox, a price
// step opens the listing's selling tools, a private offer opens the listing, a reminder opens Mi equipo.
function sellingNotificationHref(notification: NotificationTarget) {
  const listing = notification.listing_id;
  switch (notification.event_type) {
    case "gear_trade_offer":
    case "gear_trade_update":
      return "/mi-cuenta/equipo/ofertas";
    case "store_trade_request":
    case "store_trade_update":
      return "/mi-cuenta/tienda/ofertas";
    case "gear_reminder_due":
      return "/mi-cuenta/equipo";
    case "listing_price_step":
      return listing ? `/mi-cuenta/publicaciones/${listing}/herramientas` : "/mi-cuenta/publicaciones";
    case "listing_private_offer":
      return listing ? `/instrumentos/${listing}` : "/mi-cuenta/favoritos";
    case "listing_consignment_update":
      return notification.store_id && listing ? `/mi-cuenta/publicaciones/${listing}/herramientas` : "/mi-cuenta/equipo";
    default:
      return null;
  }
}
// /Feature ideas, selling-tools batch
