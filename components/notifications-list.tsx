"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { notificationHref, notificationLabel } from "@/lib/notifications";
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
        const listing = notification.listing_id ? listings[notification.listing_id] : undefined;
        // lib/notifications.ts: the same page a push of this notice opens.
        const href = notificationHref(notification, listing?.slug ?? null);
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

