"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Price } from "@/components/ui/price";
import { StatusTag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";

export type ManagedListing = {
  id: string;
  title: string;
  status: string;
  slug: string;
  price_pen: number | null;
  created_at: string;
  published_at?: string | null;
  sold_at?: string | null;
  analytics?: { views: number; contacts: number; favorites: number };
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
  const [confirm, confirmDialog] = useConfirm();

  async function runAction(listing: ManagedListing, action: string) {
    const confirmations: Record<string, ConfirmOptions> = {
      hide: { title: "¿Ocultar esta publicación del marketplace?", body: "Dejará de verse en el catálogo. Podrás restaurarla desde aquí.", confirmLabel: "Ocultar" },
      sold: { title: "¿Marcar esta publicación como vendida?", body: "La publicación original quedará bloqueada como historial.", confirmLabel: "Marcar vendida" },
      relist: { title: "¿Crear una nueva publicación copiando esta publicación vendida?", body: "La publicación vendida no cambia.", confirmLabel: "Republicar copia" },
    };
    if (confirmations[action] && !(await confirm(confirmations[action]))) return;
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
    if (action === "sold") {
      router.push(`/mi-cuenta/transacciones/${listing.id}`);
      return;
    }
    router.refresh();
  }

  if (!listings.length) {
    // Inside the page's own panel, so the empty state drops its border.
    return <EmptyState className="rounded-none border-0" title={emptyMessage} />;
  }

  // One table: from 768 px a table; on phones each row is a card and each cell shows its column name
  // (data-label), so nothing scrolls sideways and the cells keep their order.
  return (
    <div>
      {confirmDialog}
      {message ? (
        <div className="border-b border-subtle p-3"><PageNotice kind={messageKind} message={message} /></div>
      ) : null}
      <div className="md:overflow-x-auto">
        <table className="block w-full text-left text-sm md:table md:min-w-full">
          <thead className="sr-only bg-canvas t-micro text-ink-2 md:not-sr-only md:table-header-group">
            <tr>
              <th className="px-5 py-3">Publicación</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Precio</th>
              <th className="px-5 py-3">Primera publicación</th>
              <th className="px-5 py-3">Vistas</th>
              <th className="px-5 py-3">Contactos WhatsApp</th>
              <th className="px-5 py-3">Favoritos actuales</th>
              <th className="px-5 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="block divide-y divide-subtle md:table-row-group">
            {listings.map((listing) => {
              const isAdminHidden = listing.status === "hidden" && listing.hidden_source === "admin";
              const canEdit = !["sold", "archived"].includes(listing.status) && !isAdminHidden;
              return (
                <tr key={listing.id} className="grid gap-2 px-4 py-4 align-top md:table-row md:p-0">
                  <td className="block md:table-cell md:px-5 md:py-4">
                    <p className="font-semibold text-ink">{listing.title}</p>
                    {listing.revisionStatus === "pending" ? (
                      <p className="mt-1 t-meta font-semibold text-ink">Cambios en revisión; la versión aprobada sigue pública.</p>
                    ) : null}
                    {listing.revisionStatus === "rejected" && listing.revisionReason ? (
                      <p className="mt-1 max-w-sm text-meta text-danger">Última revisión rechazada: {listing.revisionReason}</p>
                    ) : null}
                    {listing.status === "rejected" && listing.rejection_reason ? (
                      <p className="mt-1 max-w-sm text-meta text-danger">Motivo: {listing.rejection_reason}</p>
                    ) : null}
                    {isAdminHidden ? (
                      <p className="mt-1 max-w-sm text-meta text-danger">Ocultada por moderación: {listing.hidden_reason}</p>
                    ) : null}
                  </td>
                  <td data-label="Estado" className={CELL}><div className="text-right md:text-left"><StatusTag domain="listing" status={listing.status} />{listing.status === "sold" && listing.sold_at ? <p className="mt-1 whitespace-nowrap text-meta text-ink-2">Marcada vendida: {formatDate(listing.sold_at)}</p> : null}</div></td>
                  <td data-label="Precio" className={cn(CELL, "whitespace-nowrap")}><Price value={listing.price_pen} size="inline" /></td>
                  <td data-label="Primera publicación" className={cn(CELL, "whitespace-nowrap")}>{listing.published_at ? formatDate(listing.published_at) : "Aún no publicada"}</td>
                  <td data-label="Vistas" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.views) : "No disponible"}</td>
                  <td data-label="Contactos WhatsApp" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.contacts) : "No disponible"}</td>
                  <td data-label="Favoritos actuales" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.favorites) : "No disponible"}</td>
                  <td className="block pt-1 md:table-cell md:px-5 md:py-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 md:min-w-56">
                      {listing.status === "approved" || listing.status === "sold" ? (
                        <Link href={`/instrumentos/${listing.slug}`} className="link font-semibold">Abrir</Link>
                      ) : null}
                      {canEdit ? (
                        <Link href={`/mi-cuenta/publicaciones/${listing.id}/editar`} className="link font-semibold">Editar</Link>
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
                        <>
                          <Link href={`/mi-cuenta/transacciones/${listing.id}`} className="link font-semibold">Atribuir venta</Link>
                          <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "relist")}>Republicar copia</ActionButton>
                        </>
                      ) : null}
                      {listing.status === "rejected" ? (
                        <ActionButton disabled={busyId === listing.id} onClick={() => runAction(listing, "resubmit")}>Enviar nuevamente</ActionButton>
                      ) : null}
                    </div>
                    {isAdminHidden ? <p className="mt-2 text-meta text-ink-2">Solo administración puede restaurarla.</p> : null}
                    {listing.status === "sold" ? <p className="mt-2 text-meta text-ink-2">El original es historial inmutable.</p> : null}
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

// Phones: label on the left, value on the right; 768 px and up: an ordinary cell.
const CELL = "flex items-start justify-between gap-4 t-ui before:t-meta before:content-[attr(data-label)] md:table-cell md:px-5 md:py-4 md:before:content-none";

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
    <button type="button" disabled={disabled} onClick={onClick} className="link font-semibold disabled:opacity-50">
      {disabled ? "Procesando…" : children}
    </button>
  );
}
