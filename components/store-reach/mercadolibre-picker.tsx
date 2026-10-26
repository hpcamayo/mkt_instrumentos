"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatMlPrice, ML_IMPORT_MAX_ITEMS, type MlSummaryItem } from "@/lib/mercadolibre/mapping";

// reach-01 "Importar desde Mercado Libre" (docs/feature-ideas/store-reach.md): the store's active Mercado Libre
// publications, 50 at a time ("Ver 50 más", never an endless list), none chosen until the store chooses. The chosen
// ones become an import the store reviews in Inventario before anything changes.
export function MercadoLibrePicker() {
  const router = useRouter();
  const [items, setItems] = useState<MlSummaryItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preparing, setPreparing] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/store/mercado-libre/items?desde=${offset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.message ?? "No pudimos leer tus publicaciones de Mercado Libre.");
        return;
      }
      setTotal(payload.total);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...(payload.items as MlSummaryItem[]).filter((item) => !seen.has(item.id))];
      });
    } catch {
      setError("No pudimos leer tus publicaciones de Mercado Libre. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  function toggle(id: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on && next.size < ML_IMPORT_MAX_ITEMS) next.add(id);
      if (!on) next.delete(id);
      return next;
    });
  }

  async function prepare() {
    if (!chosen.size || preparing) return;
    setPreparing(true);
    setError(null);
    try {
      const response = await fetch("/api/store/mercado-libre/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: [...chosen] }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setError(payload?.message ?? "No pudimos preparar la importación. Intenta de nuevo.");
        return;
      }
      router.push(`/mi-cuenta/tienda/inventario/importar/${payload.sessionId}`);
    } catch {
      setError("No pudimos preparar la importación. Revisa tu conexión.");
    } finally {
      setPreparing(false);
    }
  }

  const remaining = total === null ? 0 : Math.max(0, Math.min(total, 1000) - items.length);
  const full = chosen.size >= ML_IMPORT_MAX_ITEMS;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="t-meta tabular-nums" aria-live="polite">
          {total === null ? "Leyendo tus publicaciones…" : `${total} ${total === 1 ? "publicación activa" : "publicaciones activas"} en Mercado Libre`}
          {` · ${chosen.size} elegidas de ${ML_IMPORT_MAX_ITEMS} como máximo por importación`}
        </p>
        <div className="flex flex-wrap gap-2">
          {items.length ? (
            <Button size="sm" variant="secondary" disabled={full}
              onClick={() => setChosen((current) => new Set([...current, ...items.map((item) => item.id)].slice(0, ML_IMPORT_MAX_ITEMS)))}>
              Elegir las que se ven
            </Button>
          ) : null}
          {chosen.size ? <Button size="sm" variant="quiet" onClick={() => setChosen(new Set())}>Quitar la selección</Button> : null}
        </div>
      </div>
      {items.length ? (
        <ul className="grid divide-y divide-subtle rounded-panel border border-subtle bg-white">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 px-3">
              <Checkbox
                checked={chosen.has(item.id)}
                disabled={!chosen.has(item.id) && full}
                onChange={(event) => toggle(item.id, event.target.checked)}
                label={item.title}
                description={[
                  formatMlPrice(item.price, item.currency),
                  `stock ${item.quantity}`,
                  item.variations ? `${item.variations} variantes` : null,
                  item.currency && item.currency !== "PEN" ? "precio en dólares: lo completarás en soles" : null,
                ].filter(Boolean).join(" · ")}
              />
              {item.permalink ? (
                <a href={item.permalink} target="_blank" rel="noopener noreferrer" className="link inline-flex min-h-11 items-center t-meta">
                  Ver en Mercado Libre
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {remaining > 0 && !loading ? (
        <Button variant="secondary" className="justify-self-start" onClick={() => void load(items.length)}>Ver {Math.min(50, remaining)} más</Button>
      ) : null}
      {loading && items.length ? <p className="t-meta">Cargando…</p> : null}
      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
      <div className="grid gap-2 border-t border-subtle pt-4">
        <Button onClick={() => void prepare()} disabled={!chosen.size} loading={preparing} loadingLabel="Leyendo de Mercado Libre…" className="justify-self-start">
          Preparar la importación{chosen.size ? ` (${chosen.size})` : ""}
        </Button>
        <p className="t-meta">Nada cambia todavía: en el siguiente paso revisas cada fila, completas lo que falte y decides qué aplicar.</p>
      </div>
    </div>
  );
}

export function MercadoLibreDisconnect() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function disconnect() {
    setBusy(true);
    try {
      const response = await fetch("/api/store/mercado-libre/disconnect", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) return setMessage(payload?.message ?? "No pudimos desconectar. Intenta de nuevo.");
      router.refresh();
    } catch {
      setMessage("No pudimos desconectar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="secondary" onClick={() => void disconnect()} loading={busy} loadingLabel="Desconectando…">Desconectar</Button>
      {message ? <p role="alert" className="t-meta text-danger">{message}</p> : null}
    </div>
  );
}
