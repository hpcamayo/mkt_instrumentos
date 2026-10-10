"use client";

import { type FormEvent, useId, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { ReportTarget } from "@/components/content-report";

const reasons = [
  { value: "posible_estafa", label: "Posible estafa" },
  { value: "informacion_falsa", label: "Información falsa o engañosa" },
  { value: "articulo_prohibido", label: "Artículo o contenido prohibido" },
  { value: "contenido_inapropiado", label: "Contenido inapropiado" },
  { value: "acoso", label: "Acoso" },
  { value: "spam", label: "Spam" },
  { value: "otro", label: "Otro" },
] as const;

// The report form (REP-001–005, REVW-015). It is loaded only when "Reportar …" is pressed (UX-4 L15): it carries the
// Supabase browser client, which would otherwise weigh on every listing and store page's first load.
export default function ContentReportForm({
  targetType,
  targetId,
  onDone,
  onCancel,
}: {
  targetType: ReportTarget;
  targetId: string;
  onDone: (result: { message: string; failed: boolean }) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [busy, setBusy] = useState(false);
  const fieldId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await supabase.rpc("submit_content_report", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: String(data.get("reason") ?? ""),
      p_detail: String(data.get("detail") ?? ""),
    });
    setBusy(false);

    if (error) {
      onDone({
        failed: true,
        message: error.message.includes("ALREADY_SUBMITTED")
          ? "Ya tienes un reporte abierto para este contenido."
          : "No pudimos enviar el reporte. El contenido puede no estar disponible o no ser reportable.",
      });
      return;
    }

    onDone({ failed: false, message: "Recibimos tu reporte. El equipo de moderación lo revisará." });
  }

  return (
    <form onSubmit={submit} className="grid max-w-lg gap-3 rounded-panel bg-canvas p-4">
      <Field id={`${fieldId}-reason`} label="Motivo">
        <Select name="reason" required autoFocus>
          {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </Select>
      </Field>
      <Field id={`${fieldId}-detail`} label="Detalle opcional">
        <Textarea name="detail" maxLength={1000} rows={3} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={busy} loadingLabel="Enviando…">
          Enviar reporte
        </Button>
        <button type="button" onClick={onCancel} className={buttonClasses({ variant: "quiet" })}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
