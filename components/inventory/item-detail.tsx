"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { NewSkuSheet } from "@/components/inventory/sku-forms";
import { StockActionSheet, type StockActionType } from "@/components/inventory/stock-action-sheet";
import { UndoNotice, type InventoryNotice } from "@/components/inventory/undo-notice";
import { PageNotice } from "@/components/page-notice";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Sheet } from "@/components/ui/sheet";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import { categoryOptions } from "@/lib/listings";
import type { InventoryItem } from "@/lib/store-inventory";

// Client parts of the SKU page (design §13.2). Every write sends the version the page was rendered with; a stale
// version comes back as a clear "volver a cargar" message instead of overwriting a newer change.

type Feedback = { kind: "success" | "error"; message: string } | null;

function useFeedback() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const node = feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null;
  return [node, setFeedback] as const;
}

function StaleHint({ code }: { code: string }) {
  const router = useRouter();
  if (code !== "INVENTORY_VERSION_CONFLICT") return null;
  return <button type="button" className="link font-semibold" onClick={() => router.refresh()}>Volver a cargar</button>;
}

// ------------------------------------------------------------------ stock actions

const STOCK_BUTTONS: { type: StockActionType; label: string }[] = [
  { type: "sale", label: "Registrar venta" },
  { type: "restock", label: "Reponer stock" },
  { type: "return", label: "Devolución" },
  { type: "damage_or_loss", label: "Daño o pérdida" },
  { type: "stock_count", label: "Conteo" },
];

export function ItemStockActions({ item }: { item: InventoryItem }) {
  const [open, setOpen] = useState<{ type: StockActionType; opener: HTMLElement } | null>(null);
  const [notice, setNotice] = useState<InventoryNotice | null>(null);
  return (
    <div className="grid gap-3">
      {notice ? <UndoNotice notice={notice} onChange={setNotice} /> : null}
      <div className="flex flex-wrap gap-2">
        {STOCK_BUTTONS.map((entry) => (
          <Button
            key={entry.type}
            size="sm"
            variant="secondary"
            aria-haspopup="dialog"
            disabled={(entry.type === "sale" || entry.type === "damage_or_loss") && item.quantity_available < 1}
            onClick={(event) => { setNotice(null); setOpen({ type: entry.type, opener: event.currentTarget }); }}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      {open ? (
        <StockActionSheet
          item={item}
          initialType={open.type}
          onClose={() => { const opener = open.opener; setOpen(null); requestAnimationFrame(() => opener.focus()); }}
          onDone={(message, undo) => { setOpen(null); setNotice({ kind: "success", message, undo }); }}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ details

export function ItemDetailsForm({ item, canWrite }: { item: InventoryItem; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [notice, setNotice] = useFeedback();
  const formId = `datos-${item.id}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const found: Record<string, string> = {};
    const name = String(form.get("product_name") ?? "").trim();
    if (name.length < 2) found.product_name = "Ingresa un nombre de al menos 2 caracteres.";
    const priceText = String(form.get("unit_price_pen") ?? "").trim();
    const price = priceText ? parseWholeNumber(priceText) : null;
    if (priceText && (price === null || price < 1)) found.unit_price_pen = "Ingresa soles enteros, sin decimales.";
    if (!priceText && item.listing) found.unit_price_pen = "Una publicación vinculada necesita precio.";
    const thresholdText = String(form.get("low_stock_threshold") ?? "").trim();
    const threshold = thresholdText ? parseWholeNumber(thresholdText) : null;
    if (thresholdText && (threshold === null || threshold > 100000)) found.low_stock_threshold = "Ingresa un número entero de 0 a 100000.";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    const next = {
      product_name: name,
      variant_label: String(form.get("variant_label") ?? "").trim() || null,
      unit_price_pen: price,
      low_stock_threshold: threshold,
      external_reference: String(form.get("external_reference") ?? "").trim() || null,
    };
    // Only changed fields are sent, so the change log records what the merchant actually edited.
    const fields = Object.fromEntries(Object.entries(next).filter(([key, value]) => (item as Record<string, unknown>)[key] !== value));
    if (!Object.keys(fields).length) return setNotice({ kind: "success", message: "No había cambios por guardar." });
    setBusy(true);
    const result = await inventoryAction({ action: "update", item_id: item.id, fields, expected_version: item.version });
    setBusy(false);
    if (!result.ok) return setFailure({ code: result.code, message: result.message });
    setNotice({ kind: "success", message: item.listing && "unit_price_pen" in fields ? "Datos guardados. El precio también cambió en la publicación vinculada." : "Datos guardados." });
    router.refresh();
  }

  return (
    <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
      {notice}
      <fieldset disabled={!canWrite || item.inventory_status === "archived"} className="grid gap-4 sm:grid-cols-2">
        <Field id={`${formId}-nombre`} label="Nombre" error={errors.product_name} className="sm:col-span-2">
          <Input name="product_name" defaultValue={item.product_name} maxLength={140} autoComplete="off" />
        </Field>
        <Field id={`${formId}-variante`} label="Variante" optional>
          <Input name="variant_label" defaultValue={item.variant_label ?? ""} maxLength={80} autoComplete="off" />
        </Field>
        <Field id={`${formId}-precio`} label="Precio en soles" optional={!item.listing} hint={item.listing ? "Cambia también el precio de la publicación vinculada." : undefined} error={errors.unit_price_pen}>
          <Input name="unit_price_pen" defaultValue={item.unit_price_pen ?? ""} inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <Field id={`${formId}-umbral`} label="Avisar con stock bajo desde" optional error={errors.low_stock_threshold}>
          <Input name="low_stock_threshold" defaultValue={item.low_stock_threshold ?? ""} inputMode="numeric" pattern="[0-9]*" autoComplete="off" />
        </Field>
        <Field id={`${formId}-externa`} label="Referencia externa" optional>
          <Input name="external_reference" defaultValue={item.external_reference ?? ""} maxLength={120} autoComplete="off" />
        </Field>
      </fieldset>
      {failure ? <Notice tone="danger" role="alert">{failure.message} <StaleHint code={failure.code} /></Notice> : null}
      {canWrite && item.inventory_status === "active" ? (
        <div><Button type="submit" variant="secondary" loading={busy} loadingLabel="Guardando…">Guardar datos</Button></div>
      ) : null}
    </form>
  );
}

// ------------------------------------------------------------------ SKU change

export function SkuChangeButton({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const formId = `sku-${item.id}`;

  function close() {
    setOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sku = String(form.get("sku") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const found: Record<string, string> = {};
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(sku)) found.sku = "Usa letras, números, punto, guion o guion bajo, sin espacios; hasta 64 caracteres.";
    if (reason.length < 3) found.reason = "Cuenta brevemente por qué cambia el SKU; queda en el historial.";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const result = await inventoryAction({ action: "change_sku", item_id: item.id, sku, reason, expected_version: item.version });
    setBusy(false);
    if (!result.ok) {
      if (result.code === "INVENTORY_SKU_TAKEN" || result.code === "INVENTORY_SKU_INVALID") return setErrors({ sku: result.message });
      return setFailure({ code: result.code, message: result.message });
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button ref={ref} type="button" aria-haspopup="dialog" className="link font-semibold" onClick={() => setOpen(true)}>Cambiar SKU</button>
      {open ? (
        <Sheet
          title="Cambiar SKU"
          closeLabel="Cerrar sin guardar"
          onDismiss={close}
          layout="responsive"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" form={formId} loading={busy} loadingLabel="Guardando…">Cambiar SKU</Button>
            </div>
          }
        >
          <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
            <p className="t-body text-ink-2">El SKU actual es <strong className="text-ink">{item.merchant_sku}</strong>. Las importaciones buscan por SKU: si cambias el código aquí, usa el nuevo en tus próximas planillas.</p>
            <Field id={`${formId}-nuevo`} label="Nuevo SKU" error={errors.sku}>
              <Input name="sku" maxLength={64} autoComplete="off" autoCapitalize="characters" />
            </Field>
            <Field id={`${formId}-motivo`} label="Motivo" hint="Queda en el historial del SKU." error={errors.reason}>
              <Input name="reason" maxLength={280} autoComplete="off" />
            </Field>
            {failure ? <Notice tone="danger" role="alert">{failure.message} <StaleHint code={failure.code} /></Notice> : null}
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ publication link

export type LinkCandidate = { id: string; title: string; status: string; price_pen: number | null };

const STATUS_HINT: Record<string, string> = { pending: "en revisión", approved: "publicada", hidden: "oculta", rejected: "rechazada", draft: "borrador" };

export function LinkListingForm({ item, candidates }: { item: InventoryItem; candidates: LinkCandidate[] }) {
  const router = useRouter();
  const [listingId, setListingId] = useState("");
  const [priceChoice, setPriceChoice] = useState<"item" | "listing">("listing");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const formId = `vincular-${item.id}`;
  const chosen = candidates.find((candidate) => candidate.id === listingId);
  const pricesDiffer = Boolean(chosen && item.unit_price_pen !== null && chosen.price_pen !== null && chosen.price_pen !== item.unit_price_pen);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!chosen) return setFailure({ code: "INVALID", message: "Elige una publicación." });
    setBusy(true);
    setFailure(null);
    const price = pricesDiffer ? (priceChoice === "item" ? item.unit_price_pen : chosen.price_pen) : null;
    const result = await inventoryAction({ action: "link", item_id: item.id, listing_id: chosen.id, expected_version: item.version, unit_price_pen: price });
    setBusy(false);
    if (!result.ok) return setFailure({ code: result.code, message: result.message });
    router.refresh();
  }

  if (!candidates.length) return null;
  return (
    <form id={formId} className="grid gap-3" onSubmit={submit} noValidate>
      <Field id={`${formId}-publicacion`} label="Vincular una publicación existente" hint="Su stock pasará a controlarse desde este SKU.">
        <Select value={listingId} onChange={(event) => setListingId(event.target.value)}>
          <option value="">Elige una publicación</option>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title} ({STATUS_HINT[candidate.status] ?? candidate.status})</option>)}
        </Select>
      </Field>
      {pricesDiffer && chosen ? (
        <fieldset className="grid gap-0.5">
          <legend className="t-ui font-semibold text-ink">Los precios son distintos. ¿Cuál se mantiene?</legend>
          <Radio name="price" label={<>Precio de la publicación: <Price value={chosen.price_pen} size="inline" /></>} checked={priceChoice === "listing"} onChange={() => setPriceChoice("listing")} />
          <Radio name="price" label={<>Precio del SKU: <Price value={item.unit_price_pen} size="inline" /></>} checked={priceChoice === "item"} onChange={() => setPriceChoice("item")} />
        </fieldset>
      ) : null}
      {failure ? <Notice tone="danger" role="alert">{failure.message} <StaleHint code={failure.code} /></Notice> : null}
      <div><Button type="submit" variant="secondary" size="sm" loading={busy} loadingLabel="Vinculando…" disabled={!chosen}>Vincular</Button></div>
    </form>
  );
}

// Unlink and archive both ask for an optional reason and confirm in a sheet.
function ReasonSheetButton({
  label,
  title,
  body,
  confirmLabel,
  danger = false,
  onConfirm,
}: {
  label: string;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string | null) => Promise<{ ok: true } | { ok: false; code: string; message: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const formId = useRef(newRequestKey("motivo")).current;

  function close() {
    setOpen(false);
    requestAnimationFrame(() => ref.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim() || null;
    setBusy(true);
    setFailure(null);
    const result = await onConfirm(reason);
    setBusy(false);
    if (!result.ok) return setFailure({ code: result.code, message: result.message });
    setOpen(false);
  }

  return (
    <>
      <button ref={ref} type="button" aria-haspopup="dialog" className="link font-semibold" onClick={() => setOpen(true)}>{label}</button>
      {open ? (
        <Sheet
          title={title}
          closeLabel="Cerrar sin guardar"
          onDismiss={close}
          layout="responsive"
          footer={
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" form={formId} variant={danger ? "danger" : "primary"} loading={busy} loadingLabel="Guardando…">{confirmLabel}</Button>
            </div>
          }
        >
          <form id={formId} className="grid gap-4 pt-4" onSubmit={submit} noValidate>
            <div className="t-body text-ink-2">{body}</div>
            <Field id={`${formId}-motivo`} label="Motivo" optional hint="Queda en el historial del SKU.">
              <Input name="reason" maxLength={280} autoComplete="off" />
            </Field>
            {failure ? <Notice tone="danger" role="alert">{failure.message} <StaleHint code={failure.code} /></Notice> : null}
          </form>
        </Sheet>
      ) : null}
    </>
  );
}

export function UnlinkListingButton({ item }: { item: InventoryItem }) {
  const router = useRouter();
  return (
    <ReasonSheetButton
      label="Desvincular"
      title="¿Desvincular la publicación?"
      body="La publicación vuelve a funcionar como antes de Inventario: deja de mostrarse Agotado y puedes marcarla vendida. El SKU y su historial de stock se conservan."
      confirmLabel="Desvincular"
      onConfirm={async (reason) => {
        const result = await inventoryAction({ action: "unlink", item_id: item.id, reason, expected_version: item.version });
        if (result.ok) router.refresh();
        return result.ok ? { ok: true } : result;
      }}
    />
  );
}

export function ArchiveButton({ item }: { item: InventoryItem }) {
  const router = useRouter();
  const archived = item.inventory_status === "archived";
  return (
    <ReasonSheetButton
      label={archived ? "Reactivar SKU" : "Archivar SKU"}
      title={archived ? "¿Reactivar este SKU?" : "¿Archivar este SKU?"}
      body={archived
        ? "Volverá a la tabla de Inventario y podrás registrar movimientos."
        : "Sale de la tabla de Inventario y no admite movimientos. El stock y el historial se conservan y puedes reactivarlo cuando quieras."}
      confirmLabel={archived ? "Reactivar" : "Archivar"}
      danger={!archived}
      onConfirm={async (reason) => {
        const result = await inventoryAction({ action: archived ? "unarchive" : "archive", item_id: item.id, reason });
        if (result.ok) router.refresh();
        return result.ok ? { ok: true } : result;
      }}
    />
  );
}

export function PublishFromSkuLink({ itemId }: { itemId: string }) {
  return <Link href={`/mi-cuenta/tienda/publicar?sku=${itemId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>Publicar este SKU</Link>;
}

// ------------------------------------------------------------------ Effortless Laria, inventory batch

// stock-03: "Deshacer" in the SKU's history, for a movement the store recorded by hand in the last 15 minutes.
export function UndoMovementButton({ movementId, sku }: { movementId: string; sku: string }) {
  const router = useRouter();
  const [key] = useState(() => newRequestKey("deshacer"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <span className="t-meta">
      <button
        type="button"
        className="link font-semibold"
        disabled={busy}
        aria-label={`Deshacer este movimiento de ${sku}`}
        onClick={async () => {
          setBusy(true);
          setError("");
          const result = await inventoryAction({ action: "undo_movements", movement_ids: [movementId], key });
          setBusy(false);
          if (!result.ok) return setError(result.message);
          router.refresh();
        }}
      >
        {busy ? "Deshaciendo…" : "Deshacer"}
      </button>
      {error ? <span role="alert" className="ml-2 text-danger">{error}</span> : null}
    </span>
  );
}

// stock-20: the SKU's own category. A linked publication keeps its own; the inventory shows the publication's first.
export function ItemCategoryForm({ item, canWrite }: { item: InventoryItem; canWrite: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(item.category ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  const [notice, setNotice] = useFeedback();
  const id = `categoria-${item.id}`;
  const editable = canWrite && item.inventory_status === "active";

  async function save(next: string) {
    setValue(next);
    setBusy(true);
    setFailure(null);
    const result = await inventoryAction({ action: "category", item_id: item.id, category: next || null, expected_version: item.version });
    setBusy(false);
    if (!result.ok) return setFailure({ code: result.code, message: result.message });
    setNotice({ kind: "success", message: "Categoría guardada." });
    router.refresh();
  }

  return (
    <div className="grid gap-2">
      {notice}
      <Field
        id={id}
        label="Categoría del SKU"
        hint={item.listing?.category && item.listing.category !== value ? "La publicación vinculada tiene su propia categoría, que es la que se muestra en la lista." : "Ordena tu inventario y sus filtros."}
      >
        <Select value={value} disabled={!editable || busy} onChange={(event) => save(event.target.value)}>
          <option value="">Sin categoría</option>
          {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Field>
      {failure ? <Notice tone="danger" role="alert">{failure.message} <StaleHint code={failure.code} /></Notice> : null}
    </div>
  );
}

// stock-11: a new SKU filled from this one (no SKU, stock or codes: those belong to one SKU only).
export function DuplicateSkuButton({ item }: { item: InventoryItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} type="button" aria-haspopup="dialog" className="link font-semibold" onClick={() => setOpen(true)}>Duplicar SKU</button>
      {open ? (
        <NewSkuSheet
          initial={{
            product_name: item.product_name,
            variant_label: item.variant_label,
            unit_price_pen: item.unit_price_pen,
            low_stock_threshold: item.low_stock_threshold,
            category: item.category ?? item.listing?.category ?? null,
          }}
          onClose={() => { setOpen(false); requestAnimationFrame(() => ref.current?.focus()); }}
        />
      ) : null}
    </>
  );
}
