"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { formatPrice } from "@/lib/price";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "@/components/ui/tag";

type AccountNotification = {
  id: string;
  event_type: string;
  message: string;
  listing_id: string | null;
  store_id: string | null;
  claim_id?: string | null;
  transaction_id?: string | null;
  review_id?: string | null;
  created_at: string;
  read_at: string | null;
  old_price_pen?: number | null;
  new_price_pen?: number | null;
};

export function NotificationsList({
  notifications,
  listings = {},
  hasUnread = false,
}: {
  notifications: AccountNotification[];
  // save-10: public title and slug of the listings behind price drops and alert matches.
  listings?: Record<string, { title: string; slug: string }>;
  hasUnread?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  async function markAllRead() {
    if (!supabase || markingAll) return;
    setMarkingAll(true);
    const { error } = await supabase.rpc("mark_all_notifications_read");
    setMarkingAll(false);
    if (!error) router.refresh();
  }

  async function markRead(notification: AccountNotification, refresh = true) {
    if (!supabase || notification.read_at) return;
    setBusyId(notification.id);
    const { error } = await supabase.rpc("mark_notification_read", {
      p_notification_id: notification.id,
    });
    setBusyId(null);
    if (!error && refresh) router.refresh();
  }

  async function openNotification(notification: AccountNotification, href: string) {
    await markRead(notification, false);
    router.push(href);
    router.refresh();
  }

  if (!notifications.length) {
    return <EmptyState title="No tienes notificaciones" description="Las decisiones importantes aparecerán aquí." />;
  }

  return (
    <div className="grid gap-3">
    {hasUnread ? (
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" loading={markingAll} loadingLabel="Guardando…" onClick={() => void markAllRead()}>Marcar todo como leído</Button>
      </div>
    ) : null}
    <ol className="grid gap-3">
      {notifications.map((notification) => {
        const unread = !notification.read_at;
        const transactionReference = notification.transaction_id ?? notification.claim_id;
        const listing = notification.listing_id ? listings[notification.listing_id] : undefined;
        const href = transactionReference
          ? `/mi-cuenta/transacciones/${transactionReference}`
          : notification.event_type === "listing_alert_match"
          ? listing ? `/instrumentos/${listing.slug}` : "/mi-cuenta/alertas"
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
        return (
          <li key={notification.id} className={`rounded-panel border p-5 ${unread ? "border-accent/40 bg-accent-tint" : "border-subtle bg-white"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="t-ui font-semibold text-ink">{notificationLabel(notification.event_type)}</h2>
                  {unread ? <Tag tone="warning">Nueva</Tag> : null}
                </div>
                <p className="mt-2 t-ui text-ink-2">{notification.event_type === "listing_price_drop" && typeof notification.old_price_pen === "number" && typeof notification.new_price_pen === "number" ? `${listing ? `«${listing.title}»` : "Una publicación de tus favoritos"} bajó de ${formatPrice(notification.old_price_pen)} a ${formatPrice(notification.new_price_pen)}.` : notification.message}</p>
                <time suppressHydrationWarning className="mt-2 block t-meta" dateTime={notification.created_at}>
                  {new Date(notification.created_at).toLocaleString("es-PE")}
                </time>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3 t-ui">
                <Link href={href} onClick={(event) => { event.preventDefault(); void openNotification(notification, href); }} className="link font-semibold">{notification.event_type === "listing_alert_match" && listing ? "Ver publicación" : "Ver detalle"}</Link>
                {unread ? <Button variant="quiet" size="sm" loading={busyId === notification.id} loadingLabel="Guardando…" onClick={() => void markRead(notification)}>Marcar como leída</Button> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
    </div>
  );
}

const MY_LISTINGS_HOME_EVENTS = new Set(["listing_purchase_check", "listing_buyer_reported_purchase", "listing_availability_checkin"]);

function notificationLabel(eventType: string) {
  return ({
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
  } as Record<string, string>)[eventType] ?? "Actualización de tu cuenta";
}

// big-11: a question on the seller's listing, or the answer to the buyer's question, opens the listing's "Preguntas".
function isQuestionNotification(eventType: string) {
  return eventType === "listing_question_asked" || eventType === "listing_question_answered";
}
