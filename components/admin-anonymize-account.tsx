"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// Launch audit A20 (Ley 29733, cancelación): Admin anonymises an account when its owner asks for it in writing
// (docs/privacy/arco.md). public.admin_anonymize_account clears the person's data, keeps sales, reviews, reports and
// Libro de Reclamaciones entries without it, and writes the reason to the Admin audit
// (supabase/migrations/20261114120000_launch_audit_privacy.sql). There is no undo, so it asks for both.
export function AdminAnonymizeAccount({ userId, onComplete }: { userId: string; onComplete: (message: string) => void }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function anonymize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    if (reason.trim().length < 3) {
      setError("Escribe el motivo: la solicitud, quién la hizo y su fecha.");
      return;
    }
    if (!confirmed) {
      setError("Confirma que la cuenta se anonimiza sin vuelta atrás.");
      return;
    }
    setBusy(true);
    setError("");
    const { data, error: runError } = await supabase
      .rpc("admin_anonymize_account", { p_user_id: userId, p_reason: reason.trim() });
    setBusy(false);
    if (runError || !data) {
      setError(/^[A-Z_]+: (.+)$/.exec(runError?.message ?? "")?.[1] ?? "No pudimos anonimizar la cuenta. Revisa su estado y vuelve a intentar.");
      return;
    }
    setOpen(false);
    setReason("");
    setConfirmed(false);
    onComplete("Cuenta anonimizada. Sus ventas, reseñas y reportes siguen sin sus datos, y el motivo quedó en la auditoría.");
  }

  if (!open) {
    return (
      <Button size="sm" variant="danger" className="w-fit" onClick={() => setOpen(true)}>
        Anonimizar cuenta
      </Button>
    );
  }

  return (
    <form onSubmit={anonymize} className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4 sm:max-w-lg">
      <h3 className="font-semibold text-ink">Anonimizar cuenta</h3>
      <p className="t-ui">
        Para una solicitud de cancelación de su titular. Se borran su nombre, teléfono, correo, contraseña y sesiones, sus
        favoritos, alertas, borradores y avisos; sus publicaciones no vendidas se archivan sin datos de contacto. Sus ventas,
        reseñas, reportes y reclamos se conservan sin sus datos. Una Tienda activa se oculta antes; una cuenta Admin, nunca.
      </p>
      <Field id={`anonimizar-motivo-${userId}`} label="Motivo" hint="Queda en la auditoría: la solicitud, quién la hizo y su fecha.">
        <Textarea value={reason} rows={3} maxLength={500} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Checkbox
        checked={confirmed}
        onChange={(event) => setConfirmed(event.target.checked)}
        label="Entiendo que no se puede deshacer."
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="danger" loading={busy} loadingLabel="Anonimizando…">Anonimizar</Button>
        <Button size="sm" variant="quiet" onClick={() => { setOpen(false); setError(""); }}>Cancelar</Button>
      </div>
    </form>
  );
}
