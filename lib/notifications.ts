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
  // store-floor (reach-08, buy-07)
  store_arrival_estimate_passed: "Pasó una fecha de llegada",
  store_tryout_requested: "Te pidieron una prueba",
  store_tryout_cancelled: "Cancelaron una prueba",
  listing_tryout_confirmed: "Prueba confirmada",
  listing_tryout_declined: "La tienda no confirmó tu prueba",
  listing_tryout_cancelled: "La tienda canceló tu prueba",
  listing_tryout_reminder: "Recordatorio de tu prueba",
  // feature-ideas services (bet-02)
  service_approved: "Servicio publicado",
  service_rejected: "Servicio por corregir",
  service_hidden: "Servicio ocultado",
  service_booking_requested: "Confirma una contratación",
  service_booking_confirmed: "Contratación confirmada",
  service_booking_declined: "Contratación no confirmada",
  service_review_received: "Nueva reseña de tu servicio",
  // Feature ideas, store-reach batch (reach-04): Admin's decision on a brand authorization.
  store_dealer_approved: "Distribuidor oficial aprobado",
  store_dealer_rejected: "Autorización no aprobada",
  store_dealer_revoked: "Distribuidor oficial retirado",
  // Feature ideas, store-reach batch (reach-05): a campaign entry that did not start or that Admin removed.
  store_campaign_entry_ineligible: "Publicación fuera de la campaña",
  store_campaign_entry_removed: "Publicación retirada de la campaña",
  // --- deal-trust batch (docs/feature-ideas/deal-trust.md) ---
  store_counter_purchase_confirmed: "Compra en tienda confirmada",
  store_counter_review_revealed: "Reseñas disponibles",
  store_counter_review_reminder: "Tu reseña vence pronto",
  store_level_earned: "Tu tienda es Tienda destacada",
  store_level_lapsed: "Tu tienda dejó de ser destacada",
  store_safe_spot_disabled: "Punto seguro desactivado",
  seller_level_earned: "Eres Vendedor destacado",
  seller_level_lapsed: "Dejaste de ser Vendedor destacado",
  // --- end deal-trust batch ---
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
// deal-trust (sell-08): a seller level earned or lost opens its progress card in Compras y ventas.
export const SELLER_LEVEL_EVENTS = new Set(["seller_level_earned", "seller_level_lapsed", "store_level_earned", "store_level_lapsed"]);

export function notificationHref(notification: NotificationTarget, listingSlug?: string | null) {
  const transactionReference = notification.transaction_id ?? notification.claim_id;
  // feature-ideas services (bet-02): every service notice opens Mi cuenta › Servicios (bookings at their section).
  if (notification.event_type.startsWith("service_")) {
    return notification.event_type.startsWith("service_booking_") ? "/mi-cuenta/servicios#contrataciones" : "/mi-cuenta/servicios";
  }
  return transactionReference
    ? `/mi-cuenta/transacciones/${transactionReference}`
    : SELLER_LEVEL_EVENTS.has(notification.event_type)
    ? "/mi-cuenta/transacciones#perfil-laria"
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
    // store-floor: try-outs open each side's list; a passed arrival date opens the SKU without units.
    : notification.event_type.startsWith("listing_tryout_")
    ? "/mi-cuenta/pruebas"
    : notification.event_type.startsWith("store_tryout_")
    ? "/mi-cuenta/tienda/pruebas"
    : notification.event_type === "store_arrival_estimate_passed"
    ? "/mi-cuenta/tienda/inventario?stock=out"
    // Feature ideas, store-reach batch (reach-04, reach-05).
    : notification.event_type.startsWith("store_dealer_")
    ? "/mi-cuenta/tienda/distribuidor"
    : notification.event_type.startsWith("store_campaign_")
    ? "/mi-cuenta/tienda/campanas"
    : notification.store_id && notification.event_type.startsWith("store_")
    ? "/mi-cuenta/tienda"
    : notification.store_id
      ? "/mi-cuenta/tienda/inventario"
      : "/mi-cuenta/publicaciones";
}
