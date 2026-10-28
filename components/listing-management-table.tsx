"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ImageOff, Pause } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { ControlStockButton } from "@/components/inventory/inventory-actions";
import { PageNotice } from "@/components/page-notice";
import { UndoToast, type UndoToastMessage } from "@/components/undo-toast";
import { Button } from "@/components/ui/button";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import { Price } from "@/components/ui/price";
import { StatusTag, Tag } from "@/components/ui/tag";
import {
  INVERSE_ACTION,
  UNDO_MESSAGES,
  bulkResultMessage,
  isPrivatePhoto,
  parseBulkResult,
  pausedLabel,
  rowActions,
  type ManagedListing,
  type UndoableAction,
} from "@/lib/my-listings";
import { refreshListingPages } from "@/lib/listing-page-refresh";
import {
  RESERVATION_DAYS,
  endSentence,
  reservationDaysLabel,
  reservationEndText,
  reservationTagText,
  watchersText,
  type ReservationDays,
  type ReservationOutcome,
} from "@/lib/listing-reservations";
import { parseWholeSolPrice } from "@/lib/price";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

export type { ManagedListing } from "@/lib/my-listings";

// Actions that cannot be cleanly undone keep a confirmation; hide, restore and a new price happen at once and offer
// "Deshacer" (mine-13).
const CONFIRMATIONS: Record<"sold" | "withdraw_sold", ConfirmOptions> = {
  sold: { title: "¿Marcar esta publicación como vendida?", body: "La publicación original quedará bloqueada como historial.", confirmLabel: "Marcar vendida" },
  withdraw_sold: { title: "¿Retirar esta publicación como vendida?", body: "No se publicará y quedará en tu historial de Vendidas.", confirmLabel: "Lo vendí, retirar" },
};

type ManageResult = { ok: true; data: Record<string, unknown> | null } | { ok: false; message: string };

// talk-06: "Se vendió" after a reservation is the ordinary sold flow, with the same kind of confirmation.
const RESERVATION_SOLD: ConfirmOptions = { title: "¿Se vendió esta publicación?", body: "Quedará marcada como vendida y avisaremos a quienes esperaban que se libere.", confirmLabel: "Sí, se vendió" };

async function manage(listingId: string, body: Record<string, unknown>): Promise<ManageResult> {
  const response = await fetch(`/api/listings/${listingId}/manage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const result = response ? await response.json().catch(() => null) : null;
  if (!response?.ok) return { ok: false, message: result?.message ?? "No se pudo completar la acción." };
  return { ok: true, data: result };
}

export function ListingManagementTable({
  listings,
  emptyMessage,
  canControlStock = false,
  canReserve = false,
}: {
  listings: ManagedListing[];
  emptyMessage: string;
  canControlStock?: boolean;
  // talk-06: Particular listings can be reserved (Mis publicaciones); a store holds units through Inventario.
  canReserve?: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<UndoToastMessage | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [reserving, setReserving] = useState<string | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const dismissToast = useCallback(() => setToast(null), []);

  function notify(message: string, onUndo?: () => void) {
    setToast({ id: Date.now(), message, onUndo });
  }

  // Runs the inverse of a change the notice offered to undo.
  async function undo(run: () => Promise<ManageResult>) {
    setUndoing(true);
    const result = await run();
    setUndoing(false);
    if (!result.ok) {
      setToast(null);
      setError(result.message);
      return;
    }
    notify(UNDO_MESSAGES.undone);
    router.refresh();
  }

  async function runLifecycle(listing: ManagedListing, action: UndoableAction) {
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action });
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    notify(UNDO_MESSAGES[action], () => undo(() => manage(listing.id, { action: INVERSE_ACTION[action] })));
    router.refresh();
  }

  async function runConfirmed(listing: ManagedListing, action: "sold" | "withdraw_sold") {
    if (!(await confirm(CONFIRMATIONS[action]))) return;
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action });
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    if (action === "sold") {
      router.push(`/mi-cuenta/transacciones/${listing.id}`);
      return;
    }
    notify("Retiramos la publicación. Está en Vendidas.");
    router.refresh();
  }

  async function runResubmit(listing: ManagedListing) {
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action: "resubmit" });
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    notify("La publicación corregida volvió a moderación.");
    router.refresh();
  }

  // mine-10 / shop-08: "Republicar" (a sold listing) and "Duplicar" open a prefilled draft on the edit page.
  async function runCopy(listing: ManagedListing, action: "relist" | "duplicate") {
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action });
    const newId = result.ok && typeof result.data?.id === "string" ? result.data.id : null;
    if (!newId) {
      setBusyId(null);
      return setError(result.ok ? "No se pudo crear el borrador." : result.message);
    }
    router.push(`/mi-cuenta/publicaciones/${newId}/editar`);
  }

  async function savePrice(listing: ManagedListing, price: number) {
    const previous = listing.price_pen;
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action: "price", price_pen: price });
    setBusyId(null);
    if (!result.ok) return result.message;
    setEditingPrice(null);
    notify(UNDO_MESSAGES.price, previous === null ? undefined : () => undo(() => manage(listing.id, { action: "price", price_pen: previous })));
    router.refresh();
    return null;
  }

  // talk-06: reserve (or change the period); the public page shows "Reservado" at once.
  async function reserve(listing: ManagedListing, days: ReservationDays) {
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action: "reserve", days });
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    setReserving(null);
    const until = typeof result.data?.reservedUntil === "string" ? reservationEndText(result.data.reservedUntil) : null;
    notify(until ? `Reservada hasta ${endSentence(until)}` : "Publicación reservada.");
    router.refresh();
  }

  // "Quitar reserva" or "Sigue disponible" tell the people waiting; "Se vendió" goes on to choose the buyer.
  async function endReservation(listing: ManagedListing, outcome: ReservationOutcome) {
    if (outcome === "sold" && !(await confirm(RESERVATION_SOLD))) return;
    setBusyId(listing.id);
    setError("");
    const result = await manage(listing.id, { action: "end_reservation", outcome });
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    if (outcome === "sold") {
      router.push(`/mi-cuenta/transacciones/${listing.id}`);
      return;
    }
    const told = typeof result.data?.told === "number" ? result.data.told : 0;
    notify(told ? `Ya no está reservada. Avisamos a ${told === 1 ? "la persona que esperaba" : `las ${told} personas que esperaban`}.` : "Ya no está reservada.");
    router.refresh();
  }

  async function runBulk(action: UndoableAction, ids: string[]) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { ok: false as const, message: "No se pudo completar la acción." };
    const { data, error: rpcError } = await supabase.rpc("set_owned_listings_lifecycle_bulk", { p_listing_ids: ids, p_action: action });
    if (rpcError) return { ok: false as const, message: "No se pudo completar la acción. Revisa el estado e intenta nuevamente." };
    const result = parseBulkResult(data);
    if (result.changed.length) void refreshListingPages({ listings: result.changed });
    return { ok: true as const, ...result };
  }

  async function bulk(action: UndoableAction, ids: string[]) {
    if (!ids.length) return;
    setBusyId("bulk");
    setError("");
    const result = await runBulk(action, ids);
    setBusyId(null);
    if (!result.ok) return setError(result.message);
    setSelected(new Set());
    const changed = result.changed;
    notify(
      bulkResultMessage(action, changed.length, result.failed),
      changed.length
        ? () => undo(async () => {
          const inverse = await runBulk(INVERSE_ACTION[action], changed);
          return inverse.ok ? { ok: true, data: null } : inverse;
        })
        : undefined,
    );
    router.refresh();
  }

  if (!listings.length) {
    // Inside the page's own panel, so the empty state drops its border.
    return <EmptyState className="rounded-none border-0" title={emptyMessage} />;
  }

  const actionsById = new Map(listings.map((listing) => [listing.id, rowActions(listing, { canControlStock, canReserve })]));
  const selectable = listings.filter((listing) => actionsById.get(listing.id)?.select);
  const chosen = selectable.filter((listing) => selected.has(listing.id));
  const toHide = chosen.filter((listing) => listing.status === "approved").map((listing) => listing.id);
  const toRestore = chosen.filter((listing) => listing.status === "hidden").map((listing) => listing.id);
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const showPhotos = listings.some((listing) => listing.photoUrl !== undefined);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // One table: from 768 px a table; on phones each row is a card and each cell shows its column name
  // (data-label), so nothing scrolls sideways and the cells keep their order.
  return (
    <div>
      {confirmDialog}
      {error ? (
        <div className="border-b border-subtle p-3"><PageNotice kind="error" message={error} /></div>
      ) : null}
      {selectable.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-subtle px-4 py-3 md:px-5">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 t-ui font-semibold text-ink md:min-h-9">
            <input
              type="checkbox"
              className="h-5 w-5 shrink-0 cursor-pointer accent-ink"
              checked={allChosen}
              onChange={() => setSelected(allChosen ? new Set() : new Set(selectable.map((listing) => listing.id)))}
            />
            Seleccionar todas las de esta página
          </label>
          <span className="t-meta" aria-live="polite">{chosen.length === 1 ? "1 seleccionada" : `${chosen.length} seleccionadas`}</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!toHide.length || busyId === "bulk"} onClick={() => bulk("hide", toHide)}>Ocultar seleccionadas</Button>
            <Button variant="secondary" size="sm" disabled={!toRestore.length || busyId === "bulk"} onClick={() => bulk("restore", toRestore)}>Restaurar seleccionadas</Button>
          </div>
        </div>
      ) : null}
      <div className="md:overflow-x-auto">
        <table className="block w-full text-left text-sm md:table md:min-w-full">
          <thead className="sr-only bg-canvas t-micro text-ink-2 md:not-sr-only md:table-header-group">
            <tr>
              <th className="px-3 py-3">Publicación</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Precio</th>
              <th className="px-3 py-3">Primera publicación</th>
              <th className="px-3 py-3">Vistas</th>
              <th className="px-3 py-3">Contactos WhatsApp</th>
              <th className="px-3 py-3">Favoritos actuales</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="block divide-y divide-subtle md:table-row-group">
            {listings.map((listing) => {
              const actions = actionsById.get(listing.id)!;
              const busy = busyId === listing.id;
              const paused = pausedLabel(listing.paused_until);
              const reservation = actions.reserve ? listing.reservation ?? null : null;
              return (
                <tr key={listing.id} className="grid gap-2 px-4 py-4 align-top md:table-row md:p-0">
                  <td className="block md:table-cell md:px-3 md:py-4">
                    <div className="flex items-start gap-3">
                      {actions.select ? (
                        <label className="-m-2.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center md:-m-1 md:h-7 md:w-7">
                          <input
                            type="checkbox"
                            className="h-5 w-5 cursor-pointer accent-ink"
                            checked={selected.has(listing.id)}
                            onChange={() => toggle(listing.id)}
                            aria-label={`Seleccionar ${listing.title}`}
                          />
                        </label>
                      ) : null}
                      {showPhotos ? <Thumbnail url={listing.photoUrl ?? null} /> : null}
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{listing.title}</p>
                        {paused ? <p className="mt-1"><Tag icon={<Pause aria-hidden />}>{paused}</Tag></p> : null}
                        {reservation ? (
                          <p className="mt-1">
                            <Tag tone="warning" icon={<Clock aria-hidden />} wrap>{reservation.ended ? "Terminó la reserva · ¿Se vendió?" : reservationTagText(reservation.until)}</Tag>
                          </p>
                        ) : null}
                        {reservation && reservation.watchers > 0 ? <p className="mt-1 t-meta">{watchersText(reservation.watchers)}</p> : null}
                        {listing.revisionStatus === "pending" ? (
                          <p className="mt-1 t-meta font-semibold text-ink">Cambios en revisión; la versión aprobada sigue pública.</p>
                        ) : null}
                        {listing.revisionStatus === "rejected" && listing.revisionReason ? (
                          <p className="mt-1 max-w-sm text-meta text-danger">Última revisión rechazada: {listing.revisionReason}</p>
                        ) : null}
                        {listing.status === "rejected" && listing.rejection_reason ? (
                          <p className="mt-1 max-w-sm text-meta text-danger">Motivo: {listing.rejection_reason}</p>
                        ) : null}
                        {actions.isAdminHidden ? (
                          <p className="mt-1 max-w-sm text-meta text-danger">Ocultada por moderación: {listing.hidden_reason}</p>
                        ) : null}
                        {actions.stockManaged ? (
                          <p className="mt-1 t-meta">
                            Stock controlado en Inventario.{" "}
                            <Link href={`/mi-cuenta/tienda/inventario/${listing.inventoryItemId}`} className="link font-semibold">Ver SKU</Link>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td data-label="Estado" className={CELL}><div className="text-right md:text-left"><StatusTag domain="listing" status={listing.status} />{(listing.status === "sold" || listing.status === "archived") && listing.sold_at ? <p className="mt-1 whitespace-nowrap text-meta text-ink-2">Marcada vendida: {formatDate(listing.sold_at)}</p> : null}</div></td>
                  <td data-label="Precio" className={cn(CELL, "whitespace-nowrap")}>
                    {editingPrice === listing.id ? (
                      <PriceEditor
                        listing={listing}
                        busy={busy}
                        onCancel={() => setEditingPrice(null)}
                        onSave={(price) => savePrice(listing, price)}
                      />
                    ) : (
                      <div className="text-right md:text-left">
                        <Price value={listing.price_pen} size="inline" />
                        {actions.price ? (
                          <p className="mt-1">
                            <button type="button" id={`precio-${listing.id}`} className="link min-h-6 t-meta font-semibold" onClick={() => setEditingPrice(listing.id)} aria-label={`Cambiar precio de ${listing.title}`}>
                              Cambiar precio
                            </button>
                          </p>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td data-label="Primera publicación" className={CELL}>{listing.published_at ? formatDate(listing.published_at) : "Aún no publicada"}</td>
                  <td data-label="Vistas" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.views) : "No disponible"}</td>
                  <td data-label="Contactos WhatsApp" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.contacts) : "No disponible"}</td>
                  <td data-label="Favoritos actuales" className={CELL}>{listing.analytics ? numbers.format(listing.analytics.favorites) : "No disponible"}</td>
                  <td className="block pt-1 md:table-cell md:px-3 md:py-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 md:min-w-32 md:flex-col md:items-start md:whitespace-nowrap">
                      {actions.open ? (
                        <Link href={`/instrumentos/${listing.slug}`} className="link font-semibold">Abrir</Link>
                      ) : null}
                      {actions.preview ? (
                        <Link href={`/mi-cuenta/publicaciones/${listing.id}/vista-previa`} className="link font-semibold">Vista previa</Link>
                      ) : null}
                      {actions.edit ? (
                        <Link href={`/mi-cuenta/publicaciones/${listing.id}/editar`} className="link font-semibold">Editar</Link>
                      ) : null}
                      {actions.hide ? <ActionButton disabled={busy} onClick={() => runLifecycle(listing, "hide")}>Ocultar</ActionButton> : null}
                      {actions.markSold && !reservation?.ended ? <ActionButton disabled={busy} onClick={() => runConfirmed(listing, "sold")}>Marcar vendida</ActionButton> : null}
                      {actions.reserve && !reservation ? <ActionButton disabled={busy} onClick={() => setReserving(listing.id)}>Reservar</ActionButton> : null}
                      {reservation && !reservation.ended ? (
                        <>
                          <ActionButton disabled={busy} onClick={() => setReserving(listing.id)}>Cambiar reserva</ActionButton>
                          <ActionButton disabled={busy} onClick={() => endReservation(listing, "available")}>Quitar reserva</ActionButton>
                        </>
                      ) : null}
                      {reservation?.ended ? (
                        <>
                          <ActionButton disabled={busy} onClick={() => endReservation(listing, "sold")}>Se vendió</ActionButton>
                          <ActionButton disabled={busy} onClick={() => endReservation(listing, "available")}>Sigue disponible</ActionButton>
                          <ActionButton disabled={busy} onClick={() => setReserving(listing.id)}>Reservar otra vez</ActionButton>
                        </>
                      ) : null}
                      {actions.restore ? <ActionButton disabled={busy} onClick={() => runLifecycle(listing, "restore")}>Restaurar</ActionButton> : null}
                      {actions.soldFromHidden ? <ActionButton disabled={busy} onClick={() => runConfirmed(listing, "sold")}>Ya lo vendí</ActionButton> : null}
                      {actions.attribute ? (
                        <Link href={`/mi-cuenta/transacciones/${listing.id}`} className="link font-semibold">Atribuir venta</Link>
                      ) : null}
                      {actions.relist ? <ActionButton disabled={busy} onClick={() => runCopy(listing, "relist")}>Republicar</ActionButton> : null}
                      {actions.resubmit ? <ActionButton disabled={busy} onClick={() => runResubmit(listing)}>Enviar nuevamente</ActionButton> : null}
                      {actions.withdrawSold ? <ActionButton disabled={busy} onClick={() => runConfirmed(listing, "withdraw_sold")}>Lo vendí, retirar</ActionButton> : null}
                      {actions.duplicate ? <ActionButton disabled={busy} onClick={() => runCopy(listing, "duplicate")}>Duplicar</ActionButton> : null}
                      {actions.controlStock ? <ControlStockButton listing={{ id: listing.id, title: listing.title }} /> : null}
                    </div>
                    {reserving === listing.id ? <ReservationPicker listingId={listing.id} busy={busy} onPick={(days) => reserve(listing, days)} onCancel={() => setReserving(null)} /> : null}
                    {actions.isAdminHidden ? <p className="mt-2 text-meta text-ink-2">Solo administración puede restaurarla.</p> : null}
                    {actions.relist ? <p className="mt-2 text-meta text-ink-2">El original es historial inmutable. Republicar crea un borrador nuevo con los mismos datos.</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <UndoToast toast={toast} busy={undoing} onDismiss={dismissToast} />
    </div>
  );
}

// Phones: label on the left, value on the right; 768 px and up: an ordinary cell.
const CELL = "flex items-start justify-between gap-4 t-ui before:t-meta before:content-[attr(data-label)] md:table-cell md:px-3 md:py-4 md:before:content-none";

const numbers = new Intl.NumberFormat("es-PE");
const dates = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Lima" });

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dates.format(date) : "No disponible";
}

// The first photo, 48 px square; decorative (the title names the row).
function Thumbnail({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-tag border border-subtle bg-canvas text-ink-2">
        <ImageOff className="h-5 w-5" aria-hidden />
        <span className="sr-only">Sin foto</span>
      </span>
    );
  }
  return <Image src={url} alt="" width={48} height={48} sizes="48px" loading="lazy" unoptimized={isPrivatePhoto(url)} className="h-12 w-12 shrink-0 rounded-tag border border-subtle object-cover" />;
}

function PriceEditor({
  listing,
  busy,
  onCancel,
  onSave,
}: {
  listing: ManagedListing;
  busy: boolean;
  onCancel: () => void;
  onSave: (price: number) => Promise<string | null>;
}) {
  const [value, setValue] = useState(listing.price_pen === null ? "" : String(listing.price_pen));
  const [fieldError, setFieldError] = useState("");
  const id = `precio-${listing.id}-nuevo`;

  function close() {
    onCancel();
    requestAnimationFrame(() => document.getElementById(`precio-${listing.id}`)?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = parseWholeSolPrice(value.replace(/^\s*S\/\s*/i, "").replace(/[\s,]/g, ""));
    if (price === null) return setFieldError("Ingresa un precio válido en soles enteros.");
    if (price === listing.price_pen) return close();
    const message = await onSave(price);
    if (message) setFieldError(message);
    else requestAnimationFrame(() => document.getElementById(`precio-${listing.id}`)?.focus());
  }

  return (
    <form onSubmit={submit} noValidate className="grid w-full max-w-56 gap-2 whitespace-normal">
      <Field id={id} label="Nuevo precio" error={fieldError || undefined}>
        <PriceInput
          autoFocus
          value={value}
          onValueChange={(text) => {
            setValue(text);
            setFieldError("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" size="sm" loading={busy} loadingLabel="Guardando…">Guardar</Button>
        <Button variant="quiet" size="sm" onClick={close}>Cancelar</Button>
      </div>
    </form>
  );
}

// talk-06: how long to hold it for the buyer. One tap reserves; a new period replaces a running one.
function ReservationPicker({ listingId, busy, onPick, onCancel }: { listingId: string; busy: boolean; onPick: (days: ReservationDays) => void; onCancel: () => void }) {
  const titleId = `reservar-${listingId}`;
  return (
    <div role="group" aria-labelledby={titleId} className="mt-3 grid max-w-72 gap-2 whitespace-normal">
      <p id={titleId} className="t-ui font-semibold text-ink">¿Por cuántos días la reservas?</p>
      <div className="flex flex-wrap gap-2">
        {RESERVATION_DAYS.map((days) => (
          <Button key={days} variant="secondary" size="sm" disabled={busy} onClick={() => onPick(days)}>{reservationDaysLabel(days)}</Button>
        ))}
        <Button variant="quiet" size="sm" onClick={onCancel}>Cancelar</Button>
      </div>
      <p className="t-meta">Sigue visible con la etiqueta «Reservado» y quien quiera puede pedir que le avisemos si se libera. Al terminar te preguntamos si se vendió.</p>
    </div>
  );
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
    <button type="button" disabled={disabled} onClick={onClick} className="link min-h-6 font-semibold disabled:opacity-50">
      {disabled ? "Procesando…" : children}
    </button>
  );
}
