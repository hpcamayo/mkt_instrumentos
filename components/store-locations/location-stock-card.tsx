"use client";

import { ArrowRightLeft, ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { inventoryAction, newRequestKey, parseWholeNumber } from "@/lib/inventory-client";
import type { StoreLocation } from "@/lib/store-locations";
import { numbers } from "@/lib/store-inventory";

// run-02: one SKU's units per location, with "Mover entre sedes" (a transfer: the total stays) and "Contar en una
// sede" (a count there: the total follows). Each form keeps its own key while open, so a double tap applies once.

type Mode = { kind: "transfer" } | { kind: "count"; locationId: string } | null;

export function LocationStockCard({ item, locations, quantities, canWrite }: {
  item: { id: string; merchant_sku: string; version: number };
  locations: Pick<StoreLocation, "id" | "name" | "is_primary">[];
  quantities: Record<string, number>;
  canWrite: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [from, setFrom] = useState(() => locations.find((location) => (quantities[location.id] ?? 0) > 0)?.id ?? locations[0]?.id ?? "");
  const [to, setTo] = useState(() => locations.find((location) => location.id !== from)?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [key, setKey] = useState(() => newRequestKey("sede"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function open(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setKey(newRequestKey(next?.kind === "transfer" ? "traslado" : "conteo-sede"));
    setQuantity(next?.kind === "count" ? String(quantities[next.locationId] ?? 0) : "1");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parseWholeNumber(quantity);
    if (amount === null) {
      setError("Escribe un número entero.");
      return;
    }
    setBusy(true);
    setError("");
    const name = (locationId: string) => locations.find((location) => location.id === locationId)?.name ?? "";
    const result = mode?.kind === "transfer"
      ? await inventoryAction({ action: "location_transfer", item_id: item.id, from, to, quantity: amount, key })
      : await inventoryAction({ action: "location_movement", location_id: mode?.kind === "count" ? mode.locationId : "", item_id: item.id, type: "stock_count", quantity: amount, expected_version: item.version, key });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage(mode?.kind === "transfer"
      ? `Movimos ${numbers.format(amount)} ${amount === 1 ? "unidad" : "unidades"} de ${name(from)} a ${name(to)}.`
      : `Conteo guardado en ${name(mode?.kind === "count" ? mode.locationId : "")}: ${numbers.format(amount)}.`);
    setMode(null);
    router.refresh();
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="grid gap-4 rounded-panel border border-subtle bg-white p-5">
      <h2 id={`${id}-titulo`} className="t-section text-ink">Stock por sede</h2>
      {message ? <Notice tone="success" role="status">{message}</Notice> : null}
      <ul className="divide-y divide-subtle rounded-control border border-subtle">
        {locations.map((location) => (
          <li key={location.id} className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-3 py-2">
            <span className="t-ui text-ink">{location.name}{location.is_primary ? <span className="ml-2 t-meta">Principal</span> : null}</span>
            <span className="flex items-center gap-3">
              <span className="t-ui font-semibold tabular-nums text-ink">{numbers.format(quantities[location.id] ?? 0)}</span>
              {canWrite ? (
                <Button variant="quiet" size="sm" icon={<ClipboardCheck aria-hidden />} onClick={() => open({ kind: "count", locationId: location.id })} aria-label={`Contar ${item.merchant_sku} en ${location.name}`}>
                  Contar
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {canWrite && locations.length >= 2 && mode?.kind !== "transfer" ? (
        <Button variant="secondary" icon={<ArrowRightLeft aria-hidden />} className="w-fit" onClick={() => open({ kind: "transfer" })}>Mover entre sedes</Button>
      ) : null}
      {mode ? (
        <form onSubmit={submit} className="grid gap-4 rounded-control bg-canvas p-4" noValidate>
          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
          {mode.kind === "transfer" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id={`${id}-desde`} label="Desde">
                <Select value={from} onChange={(event) => { const next = event.target.value; setFrom(next); if (next === to) setTo(locations.find((location) => location.id !== next)?.id ?? ""); }}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name} ({numbers.format(quantities[location.id] ?? 0)})</option>)}
                </Select>
              </Field>
              <Field id={`${id}-hacia`} label="Hacia">
                <Select value={to} onChange={(event) => setTo(event.target.value)}>
                  {locations.filter((location) => location.id !== from).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </Select>
              </Field>
              <Field id={`${id}-cantidad`} label="Unidades">
                <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
            </div>
          ) : (
            <Field id={`${id}-conteo`} label={`Unidades contadas en ${locations.find((location) => location.id === mode.locationId)?.name ?? "la sede"}`} hint="El total del SKU cambia por la diferencia; las otras sedes no cambian.">
              <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} loadingLabel="Guardando…" disabled={mode.kind === "transfer" && (!to || to === from)}>
              {mode.kind === "transfer" ? "Mover unidades" : "Guardar conteo"}
            </Button>
            <Button variant="secondary" onClick={() => setMode(null)}>Cancelar</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
