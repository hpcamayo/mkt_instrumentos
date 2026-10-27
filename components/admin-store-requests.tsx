"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { FunctionCall } from "@/lib/supabase/database";

type Request = {
  id: string;
  kind: "listing_allowance" | "inventory_access";
  message: string | null;
  requested_allowance: number | null;
  created_at: string;
  allowance: number;
  inventory_enabled: boolean;
};

const dateFormat = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeZone: "America/Lima" });
const databaseMessage = (message: string | undefined, fallback: string) => /^[A-Z_]+: (.+)$/.exec(message ?? "")?.[1] ?? fallback;

// Admin: what a store asked for from Mi tienda (Effortless Laria, stores: shop-05 "Pedir más cupo", stock-21 "Solicitar
// acceso"). Inventory is turned on here with an audited reason; a new allowance is set with "Cupo de publicaciones"
// below. Closing a request only records the decision; the store sees the request disappear.
export function AdminStoreRequests({ storeId, onComplete }: { storeId: string; onComplete: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [requests, setRequests] = useState<Request[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase.rpc("get_admin_store_requests", { p_status: "open", p_store_id: storeId });
    if (!loadError && Array.isArray(data)) setRequests(data as Request[]);
  }, [supabase, storeId]);

  useEffect(() => { void load(); }, [load]);

  async function run(id: string, steps: FunctionCall[], done: string) {
    if (!supabase || busy) return;
    setBusy(id);
    setError("");
    for (const [fn, args] of steps) {
      const { error: stepError } = await supabase.rpc(fn, args);
      if (stepError) {
        setBusy("");
        setError(databaseMessage(stepError.message, "No pudimos completar la acción."));
        return;
      }
    }
    setBusy("");
    onComplete(done);
    await load();
  }

  if (!requests.length && !error) return null;
  return (
    <section className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4">
      <h3 className="font-semibold text-ink">Solicitudes de la tienda</h3>
      <ul className="grid gap-3">
        {requests.map((request) => (
          <li key={request.id} className="grid gap-2 rounded-panel border border-subtle bg-white p-3 t-ui">
            <p className="font-semibold text-ink">
              {request.kind === "inventory_access" ? "Pide acceso a Inventario" : `Pide más cupo${request.requested_allowance ? `: ${request.requested_allowance} en total (hoy ${request.allowance})` : ` (hoy ${request.allowance})`}`}
              <span className="font-normal text-ink-2"> · {dateFormat.format(new Date(request.created_at))}</span>
            </p>
            {request.message ? <p className="text-ink-2">“{request.message}”</p> : null}
            <div className="flex flex-wrap gap-2">
              {request.kind === "inventory_access" && !request.inventory_enabled ? (
                <Button size="sm" variant="secondary" loading={busy === request.id} loadingLabel="Activando…"
                  onClick={() => void run(request.id, [
                    ["admin_set_store_inventory_enabled", { p_store_id: storeId, p_enabled: true, p_reason: "Solicitud de la tienda desde Mi tienda" }],
                    ["admin_close_store_request", { p_request_id: request.id, p_status: "resolved", p_note: "Inventario activado" }],
                  ], "Inventario activado. El cambio quedó en la auditoría.")}>
                  Activar Inventario
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={Boolean(busy)}
                  onClick={() => void run(request.id, [["admin_close_store_request", { p_request_id: request.id, p_status: "resolved" }]], "Solicitud marcada como resuelta.")}>
                  Marcar resuelta
                </Button>
              )}
              <Button size="sm" variant="quiet" disabled={Boolean(busy)}
                onClick={() => void run(request.id, [["admin_close_store_request", { p_request_id: request.id, p_status: "dismissed" }]], "Solicitud descartada.")}>
                Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </section>
  );
}
