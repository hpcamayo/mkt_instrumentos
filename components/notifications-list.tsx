"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type AccountNotification = {
  id: string;
  event_type: string;
  message: string;
  listing_id: string | null;
  store_id: string | null;
  created_at: string;
  read_at: string | null;
};

export function NotificationsList({ notifications }: { notifications: AccountNotification[] }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    return (
      <div className="rounded-lg border border-laria-fog bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-black text-laria-ink">No tienes notificaciones</h2>
        <p className="mt-2 text-sm text-laria-text-soft">Las decisiones importantes aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <ol className="grid gap-3">
      {notifications.map((notification) => {
        const unread = !notification.read_at;
        const href = notification.store_id && notification.event_type.startsWith("store_")
          ? "/mi-cuenta/tienda"
          : notification.store_id
            ? "/mi-cuenta/tienda/inventario"
            : "/mi-cuenta/publicaciones";
        return (
          <li key={notification.id} className={`rounded-lg border p-5 shadow-sm ${unread ? "border-laria-blue/35 bg-laria-blue/10" : "border-laria-fog bg-white"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black text-laria-ink">{notificationLabel(notification.event_type)}</h2>
                  {unread ? <span className="rounded-full bg-laria-yellow px-2 py-0.5 text-[11px] font-black text-laria-black">Nueva</span> : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-laria-text-soft">{notification.message}</p>
                <time suppressHydrationWarning className="mt-2 block text-xs font-semibold text-laria-muted" dateTime={notification.created_at}>
                  {new Date(notification.created_at).toLocaleString("es-PE")}
                </time>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3 text-sm">
                <Link href={href} onClick={(event) => { event.preventDefault(); void openNotification(notification, href); }} className="font-black text-laria-blue underline-offset-4 hover:underline">Ver detalle</Link>
                {unread ? <button type="button" disabled={busyId === notification.id} onClick={() => void markRead(notification)} className="font-black text-laria-text-soft underline-offset-4 hover:underline disabled:opacity-50">{busyId === notification.id ? "Guardando…" : "Marcar como leída"}</button> : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function notificationLabel(eventType: string) {
  return ({
    listing_approved: "Publicación aprobada",
    listing_rejected: "Publicación rechazada",
    listing_hidden: "Publicación ocultada",
    listing_revision_approved: "Cambios aprobados",
    listing_revision_rejected: "Cambios rechazados",
    store_approved: "Tienda aprobada",
    store_rejected: "Solicitud rechazada",
    store_verified: "Tienda Verificada",
    store_verification_revoked: "Verificación revocada",
  } as Record<string, string>)[eventType] ?? "Actualización de tu cuenta";
}
