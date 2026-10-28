"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

type Quota = { allowance: number; used: number; remaining: number; is_default: boolean };

// Admin: a store's listing allowance (design §10, D-1). The default is 50; a pilot store gets an explicit value with a
// reason, recorded in the Admin audit. Lowering it below the current count hides nothing; it only stops new
// publications until the count is under the new value.
export function AdminStoreAllowance({ storeId, onComplete }: { storeId: string; onComplete: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!supabase || busy) return;
    setOpen(true);
    setBusy(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc("get_store_listing_quota", { p_store_id: storeId });
    setBusy(false);
    if (loadError || !data) {
      setError("No pudimos cargar el cupo de la tienda.");
      return;
    }
    setQuota(data as Quota);
    setValue(String((data as Quota).allowance));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const allowance = Number(value);
    if (!Number.isInteger(allowance) || allowance < 1 || allowance > 2000) {
      setError("El cupo debe ser un número entero entre 1 y 2000.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indica el motivo del cambio.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: saveError } = await supabase
      .rpc("admin_set_store_listing_allowance", { p_store_id: storeId, p_allowance: allowance, p_reason: reason.trim() });
    setBusy(false);
    if (saveError || !data) {
      setError(/^[A-Z_]+: (.+)$/.exec(saveError?.message ?? "")?.[1] ?? "No pudimos guardar el cupo.");
      return;
    }
    const next = data as Quota;
    setQuota(next);
    setReason("");
    setOpen(false);
    onComplete(`Cupo de publicaciones: ${next.allowance} (${next.used} en uso). El cambio quedó en la auditoría.`);
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" className="w-fit" onClick={() => void load()}>
        Cupo de publicaciones
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4 sm:max-w-md">
      <h3 className="font-semibold text-ink">Cupo de publicaciones</h3>
      {quota ? (
        <p className="t-ui">
          {quota.used} de {quota.allowance} en uso{quota.is_default ? " (valor por defecto)" : ""}. Cuentan las publicaciones en
          revisión y publicadas.
        </p>
      ) : <p className="t-ui text-ink-2">{busy ? "Cargando…" : ""}</p>}
      <Field id={`cupo-${storeId}`} label="Nuevo cupo" hint="Entre 1 y 2000. Bajarlo no oculta publicaciones; solo impide publicar más.">
        <Input type="number" inputMode="numeric" min={1} max={2000} value={value} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <Field id={`cupo-motivo-${storeId}`} label="Motivo">
        <Input value={reason} maxLength={280} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" loading={busy} loadingLabel="Guardando…" disabled={!quota}>Guardar cupo</Button>
        <Button size="sm" variant="quiet" onClick={() => { setOpen(false); setError(""); }}>Cancelar</Button>
      </div>
    </form>
  );
}
