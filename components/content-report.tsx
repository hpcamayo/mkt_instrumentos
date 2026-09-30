"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type ReportTarget = "listing" | "store" | "review";

const reasons = [
  { value: "posible_estafa", label: "Posible estafa" },
  { value: "informacion_falsa", label: "Información falsa o engañosa" },
  { value: "articulo_prohibido", label: "Artículo o contenido prohibido" },
  { value: "contenido_inapropiado", label: "Contenido inapropiado" },
  { value: "acoso", label: "Acoso" },
  { value: "spam", label: "Spam" },
  { value: "otro", label: "Otro" },
] as const;

export function ContentReport({
  targetType,
  targetId,
  label,
}: {
  targetType: ReportTarget;
  targetId: string;
  label: string;
}) {
  const pathname = usePathname();
  const account = useMarketplaceAccount();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const fieldId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (message) {
      feedbackRef.current?.focus();
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [message]);

  useEffect(() => {
    if (!open && restoreFocusRef.current && !message) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [message, open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setFailed(false);
    const { error } = await supabase.rpc("submit_content_report", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: String(data.get("reason") ?? ""),
      p_detail: String(data.get("detail") ?? ""),
    });
    setBusy(false);

    if (error) {
      setFailed(true);
      setMessage(
        error.message.includes("ALREADY_SUBMITTED")
          ? "Ya tienes un reporte abierto para este contenido."
          : "No pudimos enviar el reporte. El contenido puede no estar disponible o no ser reportable.",
      );
      return;
    }

    setOpen(false);
    setMessage("Recibimos tu reporte. El equipo de moderación lo revisará.");
  }

  if (!account.ready) {
    return <span className="t-meta">Comprobando acceso…</span>;
  }

  if (!account.authenticated) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="link t-meta font-semibold"
      >
        Ingresa para {label.toLowerCase()}
      </Link>
    );
  }

  return (
    <div className="grid gap-2">
      {message ? (
        <p
          ref={feedbackRef}
          tabIndex={-1}
          role={failed ? "alert" : "status"}
          className={failed ? "t-meta font-semibold text-danger" : "t-meta font-semibold"}
        >
          {message}
        </p>
      ) : null}
      {!open ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setMessage("");
            setFailed(false);
            setOpen(true);
          }}
          className="link w-fit t-meta font-semibold"
        >
          {label}
        </button>
      ) : (
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
            <button type="button" onClick={() => {
              restoreFocusRef.current = true;
              setMessage("");
              setOpen(false);
            }} className={buttonClasses({ variant: "quiet" })}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
