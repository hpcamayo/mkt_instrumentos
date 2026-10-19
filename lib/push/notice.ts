import { formatPrice } from "@/lib/price";
import type { PushMessage } from "@/lib/push/web-push";

// big-12 (docs/ux-effortless/speed.md): what a push says. One pending notice reads like its row in
// Mi cuenta > Notificaciones (the same label and page, components/notifications-list.tsx) with the listing's name in
// front; several become one message that opens the notifications page.
export type PushNotice = {
  delivery_id: string;
  event_type: string;
  message: string;
  created_at: string;
  listing_id: string | null;
  listing_title: string | null;
  store_id: string | null;
  claim_id: string | null;
  transaction_id: string | null;
  old_price_pen: number | null;
  new_price_pen: number | null;
};

const LABELS: Record<string, string> = {
  listing_price_drop: "Bajó de precio un favorito",
  listing_approved: "Publicación aprobada",
  listing_rejected: "Publicación rechazada",
  listing_hidden: "Publicación ocultada",
  listing_revision_approved: "Cambios aprobados",
  listing_revision_rejected: "Cambios rechazados",
  store_approved: "Tienda aprobada",
  store_rejected: "Solicitud rechazada",
  store_verified: "Tienda verificada",
  store_verification_revoked: "Verificación revocada",
  transaction_confirmation_requested: "Confirma una compra",
  transaction_confirmed: "Transacción confirmada",
  transaction_declined: "Confirmación rechazada",
  transaction_cancelled: "Solicitud cancelada",
  review_revealed: "Reseñas disponibles",
};

export function pushNoticeLabel(eventType: string) {
  return LABELS[eventType] ?? "Actualización de tu cuenta";
}

export function pushNoticeHref(notice: Pick<PushNotice, "event_type" | "listing_id" | "store_id" | "claim_id" | "transaction_id">) {
  const transactionReference = notice.transaction_id ?? notice.claim_id;
  if (transactionReference) return `/mi-cuenta/transacciones/${transactionReference}`;
  if (notice.event_type === "listing_price_drop" && notice.listing_id) return `/mi-cuenta/favoritos/${notice.listing_id}`;
  if (notice.store_id && notice.event_type.startsWith("store_")) return "/mi-cuenta/tienda";
  if (notice.store_id) return "/mi-cuenta/tienda/inventario";
  return "/mi-cuenta/publicaciones";
}

// notices: one person's pending notices, newest first (as claim_push_deliveries returns them).
export function pushMessageFor(notices: PushNotice[]): PushMessage {
  const [newest, ...older] = notices;
  if (!newest) throw new Error("PUSH_NOTICES_EMPTY");
  if (!older.length) return { title: pushNoticeLabel(newest.event_type), body: clip(noticeBody(newest), 180), url: pushNoticeHref(newest) };
  const rest = older.length === 1 ? ` y ${lowerFirst(pushNoticeLabel(older[0].event_type))}` : ` y ${older.length} más`;
  return { title: `${notices.length} avisos nuevos en Laria`, body: clip(`${pushNoticeLabel(newest.event_type)}${rest}.`, 180), url: "/mi-cuenta/notificaciones" };
}

function noticeBody(notice: PushNotice) {
  const listing = notice.listing_title?.trim() ? clip(notice.listing_title.trim(), 60) : null;
  if (notice.event_type === "listing_price_drop" && typeof notice.old_price_pen === "number" && typeof notice.new_price_pen === "number") {
    return `${listing ?? "Una publicación de tus favoritos"} bajó de ${formatPrice(notice.old_price_pen)} a ${formatPrice(notice.new_price_pen)}.`;
  }
  return listing ? `${listing}: ${lowerFirst(notice.message)}` : notice.message;
}

function lowerFirst(text: string) {
  return text.charAt(0).toLocaleLowerCase("es-PE") + text.slice(1);
}

// Cut at a word when one ends near the limit, so a long name never ends mid-word.
function clip(text: string, length: number) {
  if (text.length <= length) return text;
  const cut = text.slice(0, length - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > length * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
