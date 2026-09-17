"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { listingStatusLabel } from "@/lib/account-ui";
import { formatPrice } from "@/lib/listings";

export type ManagedListing = {
  id: string;
  title: string;
  status: string;
  slug: string;
  price_pen: number | null;
  created_at: string;
  published_at?: string | null;
  sold_at?: string | null;
  analytics?: { views: number; contacts: number };
  rejection_reason: string | null;
  hidden_source: string | null;
  hidden_reason: string | null;
  revisionStatus: "pending" | "rejected" | null;
  revisionReason: string | null;
};

export function ListingManagementTable({
  listings,
  emptyMessage,
}: {
  listings: ManagedListing[];
  emptyMessage: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");

  async function runAction(listing: ManagedListing, action: string) {
    const confirmations: Record<string, string> = {
      hide: "¿Ocultar esta publicación del marketplace?",
      sold: "¿Marcar esta publicación como vendida? El registro original quedará bloqueado.",
      relist: "¿Crear una nueva publicación copiando este registro vendido?",
    };
    if (confirmations[action] && !window.confirm(confirmations[action])) return;
    setBusyId(listing.id);
    setMessage("");
    const response = await fetch(`/api/listings/${listing.id}/manage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setMessageKind("error");
      setMessage(result?.message ?? "No se pudo completar la acción.");
      setBusyId(null);
      return;
    }
    setMessageKind("success");
    setMessage(
      action === "relist"
        ? "Se creó una nueva publicación sin modificar el registro vendido."
        : action === "resubmit"
          ? "La publicación corregida volvió a moderación."
        : "Estado actualizado correctamente.",
    );
    setBusyId(null);
    router.refresh();
  }

  if (!listings.length) {
    return <p className="p-6 text-sm text-laria-text-soft">{emptyMessage}</p>;
  }

  return (
    <div>
      {message ? (
        <div className="border-b border-laria-fog p-3"><PageNotice kind={messageKind} message={message} /></div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-laria-cloud text-xs uppercase tracking-wide text-laria-text-soft">
            <tr>
              <th className="px-5 py-3">Publicación</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Precio</th>
              <th className="px-5 py-3">Primera publicación</th>
              <th className="px-5 py-3">Vistas</th>
              <th className="px-5 py-3">Contactos WhatsApp</th>
              <th className="px-5 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-laria-fog">
            {listings.map((listing) => {
              const isAdminHidden = listing.status === "hidden" && listing.hidden_source === "admin";
              const canEdit = !["sold", "archived"].includes(listing.status) && !isAdminHidden;
              return (
                <tr key={listing.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-bold text-laria-ink">{listing.title}</p>
                    {listing.revisionStatus === "pending" ? (
                      <p className="mt-1 text-xs font-bold text-amber-700">Cambios en revisión; la versión aprobada sigue pública.</p>
                    ) : null}
                    {listing.revisionStatus === "rejected" && listing.revisionReason ? (
                      <p className="mt-1 max-w-sm text-xs text-red-700">Última revisión rechazada: {listing.revisionReason}</p>
                    ) : null}
                    {listing.status === "rejected" && listing.rejection_reason ? (
                      <p className="mt-1 max-w-sm text-xs text-red-700">Motivo: {listing.rejection_reason}</p>
                    ) : null}
                    {isAdminHidden ? (
                      <p className="mt-1 max-w-sm text-xs text-red-700">Ocultada por moderación: {listing.hidden_reason}</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">{listingStatusLabel(listing.status)}{listing.status === "sold" && listing.sold_at ? <p className="mt-1 whitespace-nowrap text-xs text-laria-text-soft">Marcada vendida: {formatDate(listing.sold_at)}</p> : null}</td>
                  <td className="px-5 py-4">{formatPrice(listing.price_pen)}</td>
                  <td className="whitespace-nowrap px-5 py-4">{listing.published_at ? formatDate(listing.published_at) : "Aún no publicada"}</td>
                  <td className="px-5 py-4">{listing.analytics ? numbers.format(listing.analytics.views) : "No disponible"}</td>
                  <td className="px-5 py-4">{listing.analytics ? numbers.format(listing.analytics.contacts) : "No disponible"}</td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-56 flex-wrap gap-x-4 gap-y-2">
                      {listing.status === "approved" || listing.status === "sold" ? (
                        <Link href={`/instrumentos/${listing.slug}`} className="font-black text-laria-blue">Abrir</Link>
                      ) : null}
                      {canEdit ? (
                        <Link href={`/mi-cuenta/publicaciones/${listing.id}/editar`} className="font-black text-laria-blue">Editar</Link>
                      ) : null}
                      {listing.status === "approved" ? (
                        <>
                          <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "hide")}>Ocultar</ActionButton>
                          <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "sold")}>Marcar vendida</ActionButton>
                        </>
                      ) : null}
                      {listing.status === "hidden" && listing.hidden_source === "owner" ? (
                        <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "restore")}>Restaurar</ActionButton>
                      ) : null}
                      {listing.status === "sold" ? (
                        <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "relist")}>Republicar copia</ActionButton>
                      ) : null}
                      {listing.status === "rejected" ? (
                        <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "resubmit")}>Enviar nuevamente</ActionButton>
                      ) : null}
                    </div>
                    {isAdminHidden ? <p className="mt-2 text-xs text-laria-text-soft">Solo administración puede restaurarla.</p> : null}
                    {listing.status === "sold" ? <p className="mt-2 text-xs text-laria-text-soft">El original es historial inmutable.</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const numbers = new Intl.NumberFormat("es-PE");
const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dates.format(date) : "No disponible";
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="font-black text-laria-blue disabled:opacity-50">
      {disabled ? "Procesando…" : children}
    </button>
  );
}
