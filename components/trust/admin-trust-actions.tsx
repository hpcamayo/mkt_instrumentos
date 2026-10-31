"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Admin > Confianza actions (deal-trust). Each one is audit-logged by the database (record_admin_audit); hiding a
// photo or withdrawing a Punto seguro needs a reason.

export function ReviewPhotoModeration({ photoId, status }: { photoId: string; status: "pending" | "approved" | "hidden" }) {
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function moderate(next: "approved" | "hidden") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("moderate_review_photo", {
      p_photo_id: photoId,
      p_status: next,
      p_reason: next === "hidden" ? reason.trim() : null,
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message.includes("REASON") ? "Escribe el motivo para ocultarla." : "No se pudo guardar. Intenta nuevamente.");
    else router.refresh();
  }
  return (
    <div className="grid gap-2">
      {status !== "hidden" ? (
        <Field id={`${id}-motivo`} label="Motivo, si la ocultas">
          <Input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status !== "approved" ? <Button size="sm" variant="secondary" loading={busy} onClick={() => void moderate("approved")}>Aprobar</Button> : null}
        {status !== "hidden" ? <Button size="sm" variant="secondary" disabled={busy || !reason.trim()} onClick={() => void moderate("hidden")}>Ocultar</Button> : null}
      </div>
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </div>
  );
}

export function SafeSpotAdmin({ storeId, disabled }: { storeId: string; disabled: boolean }) {
  const id = useId();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function set(allowed: boolean) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("admin_set_safe_spot", {
      p_store_id: storeId,
      p_allowed: allowed,
      p_reason: allowed ? null : reason.trim(),
    });
    setBusy(false);
    if (rpcError) setError(rpcError.message.includes("REASON") ? "Escribe el motivo; la tienda lo verá." : "No se pudo guardar. Intenta nuevamente.");
    else router.refresh();
  }
  return disabled ? (
    <div className="grid gap-2">
      <Button size="sm" variant="secondary" className="w-fit" loading={busy} onClick={() => void set(true)}>Permitir de nuevo</Button>
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </div>
  ) : (
    <div className="grid gap-2">
      <Field id={`${id}-motivo`} label="Motivo (la tienda lo verá)">
        <Input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Button size="sm" variant="secondary" className="w-fit" disabled={busy || !reason.trim()} onClick={() => void set(false)}>Quitar Punto seguro</Button>
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </div>
  );
}
