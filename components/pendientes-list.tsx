"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, CircleDot, Info } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { PriceInput } from "@/components/ui/price-input";
import type { Pendiente } from "@/lib/pendientes";
import { parseWholeSolPrice } from "@/lib/price";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { transactionErrorMessage } from "@/lib/transactions";

// big-09: the to-do list itself. Items with one-tap answers (¿Compraste…?, ¿Sigue disponible?, a buyer's "Sí")
// answer here; the rest link to the place where the chore is done.
export function PendientesList({ items, title, emptyTitle }: { items: Pendiente[]; title: string; emptyTitle: string }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const open = items.filter((item) => !(item.key in done));
  return (
    <section aria-labelledby="pendientes-titulo" className="rounded-panel border border-subtle bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-subtle p-5">
        <h2 id="pendientes-titulo" className="t-section text-ink">{title}</h2>
        {open.length ? <p className="t-meta">{open.length === 1 ? "1 pendiente" : `${open.length} pendientes`}</p> : null}
      </div>
      {Object.values(done).length ? (
        <ul aria-live="polite" className="grid gap-1 border-b border-subtle bg-accent-tint px-5 py-3">
          {Object.entries(done).map(([key, message]) => <li key={key} className="flex items-start gap-2 t-ui text-ink"><CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{message}</li>)}
        </ul>
      ) : null}
      {open.length ? (
        <ol className="divide-y divide-subtle">
          {open.map((item) => <PendienteRow key={item.key} item={item} onDone={(message) => setDone((current) => ({ ...current, [item.key]: message }))} />)}
        </ol>
      ) : (
        <EmptyState className="rounded-none border-0" headingLevel={3} title={emptyTitle} description="Cuando algo necesite tu atención, aparecerá aquí primero." />
      )}
    </section>
  );
}

function PendienteRow({ item, onDone }: { item: Pendiente; onDone: (message: string) => void }) {
  const Icon = item.tone === "action" ? CircleDot : Info;
  return (
    <li className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
        <div className="min-w-0">
          <p className="t-ui font-semibold text-ink">{item.title}</p>
          {item.detail ? <p className="mt-1 t-meta">{item.detail}</p> : null}
        </div>
      </div>
      <PendienteActions item={item} onDone={onDone} />
    </li>
  );
}

function PendienteActions({ item, onDone }: { item: Pendiente; onDone: (message: string) => void }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [priceOpen, setPriceOpen] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const action = item.action;

  async function run<T>(call: () => PromiseLike<{ data: T; error: { message: string } | null }>, message: string, next?: (data: T) => string | null) {
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    const { data, error: failure } = await call();
    setBusy(false);
    if (failure) {
      setError(failure.message.includes("INVENTORY_MANAGED_LISTING") ? "Esta publicación está vinculada a Inventario. Registra la venta desde Inventario." : transactionErrorMessage(failure.message));
      return;
    }
    const href = next?.(data) ?? null;
    if (href) {
      router.push(href);
      return;
    }
    onDone(message);
    router.refresh();
  }

  if (action.kind === "link") {
    return <Link href={action.href} className={buttonClasses({ variant: "secondary", className: "justify-self-start sm:justify-self-end" })}>{action.label}</Link>;
  }

  const errorLine = error ? <p role="alert" className="t-meta font-semibold text-danger sm:col-span-2">{error}</p> : null;

  if (action.kind === "purchase_check") {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button variant="secondary" disabled={busy} onClick={() => void run(
            () => supabase!.rpc("answer_purchase_checkin", { p_listing_id: action.listingId, p_bought: true }),
            "Gracias. Le pedimos a quien vende que lo confirme.",
            (data) => {
              const claim = data && typeof data === "object" && !Array.isArray(data) ? (data as { claim_id?: unknown }).claim_id : null;
              return typeof claim === "string" ? `/mi-cuenta/transacciones/${claim}` : null;
            },
          )}>Sí, lo compré</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void run(
            () => supabase!.rpc("answer_purchase_checkin", { p_listing_id: action.listingId, p_bought: false }),
            "Anotado. No volveremos a preguntarte por esta publicación.",
          )}>No lo compré</Button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (action.kind === "buyer_report") {
    return (
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {action.stockManaged ? (
            <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary" })}>Ir a Inventario</Link>
          ) : (
            <Button variant="secondary" disabled={busy} onClick={async () => {
              if (!(await confirm({ title: "¿Confirmas que te compró este equipo?", body: "La publicación queda vendida y se abren 10 días para las reseñas de ambos.", confirmLabel: "Confirmar venta" }))) return;
              await run(
                () => supabase!.rpc("decide_purchase_checkin", { p_checkin_id: action.checkinId, p_confirmed: true }),
                "Venta confirmada.",
                (data) => {
                  const id = data && typeof data === "object" && !Array.isArray(data) ? (data as { transaction_id?: unknown }).transaction_id : null;
                  return typeof id === "string" ? `/mi-cuenta/transacciones/${id}` : null;
                },
              );
            }}>Sí, me lo compró</Button>
          )}
          <Button variant="quiet" disabled={busy} onClick={() => void run(
            () => supabase!.rpc("decide_purchase_checkin", { p_checkin_id: action.checkinId, p_confirmed: false }),
            "Anotado. No se creó ninguna venta.",
          )}>No fue así</Button>
        </div>
        {confirmDialog}
        {errorLine}
      </div>
    );
  }

  async function lowerPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.kind !== "availability") return;
    const price = parseWholeSolPrice(String(new FormData(event.currentTarget).get("price") ?? ""));
    if (price === null) return setError("Ingresa un precio válido en soles enteros.");
    const listingId = action.listingId;
    // A new price answers "¿Sigue disponible?" too, so both happen in one step.
    await run(async () => {
      const priced = await supabase!.rpc("set_owned_listing_price", { p_listing_id: listingId, p_price_pen: price });
      if (priced.error) return priced;
      return supabase!.rpc("confirm_listing_available", { p_listing_id: listingId });
    }, "Precio actualizado y disponibilidad confirmada.");
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Button variant="secondary" disabled={busy} onClick={() => void run(
          () => supabase!.rpc("confirm_listing_available", { p_listing_id: action.listingId }),
          "Gracias. Volveremos a preguntarte en un mes.",
        )}>Sí, sigue disponible</Button>
        <Button variant="quiet" disabled={busy} onClick={async () => {
          if (!(await confirm({ title: "¿Marcar esta publicación como vendida?", body: "La publicación original quedará bloqueada como historial.", confirmLabel: "Marcar vendida" }))) return;
          await run(
            () => supabase!.rpc("set_owned_listing_lifecycle", { p_listing_id: action.listingId, p_action: "sold" }),
            "Marcada como vendida.",
            () => `/mi-cuenta/transacciones/${action.listingId}`,
          );
        }}>Lo vendí</Button>
        <Button variant="quiet" disabled={busy} aria-expanded={priceOpen} onClick={() => setPriceOpen((current) => !current)}>Bajar precio</Button>
      </div>
      {priceOpen ? (
        <form onSubmit={lowerPrice} className="flex flex-wrap items-end gap-2 sm:justify-end">
          <Field id={`precio-${action.listingId}`} label="Nuevo precio en soles" className="w-40">
            <PriceInput name="price" defaultValue={action.price} required />
          </Field>
          <Button type="submit" variant="secondary" loading={busy} loadingLabel="Guardando…">Guardar</Button>
        </form>
      ) : null}
      {confirmDialog}
      {errorLine}
    </div>
  );
}
