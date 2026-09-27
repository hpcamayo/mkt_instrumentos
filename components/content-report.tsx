"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

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
    return <span className="text-xs text-laria-muted">Comprobando acceso…</span>;
  }

  if (!account.authenticated) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="text-xs font-black text-laria-blue underline-offset-4 hover:underline"
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
          className={failed ? "text-xs font-bold text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-laria-blue" : "text-xs font-bold text-laria-text-soft outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"}
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
          className="w-fit text-xs font-black text-laria-blue underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-laria-blue"
        >
          {label}
        </button>
      ) : (
        <form onSubmit={submit} className="grid max-w-lg gap-3 rounded-md border border-laria-fog bg-laria-cloud p-3">
          <label className="grid gap-1 text-xs font-bold text-laria-text-soft">
            Motivo
            <select name="reason" required autoFocus className="min-h-11 rounded-md border border-laria-steel bg-white px-3 text-sm text-laria-ink outline-none focus-visible:ring-2 focus-visible:ring-laria-blue">
              {reasons.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-laria-text-soft">
            Detalle opcional
            <textarea name="detail" maxLength={1000} rows={3} className="rounded-md border border-laria-steel bg-white px-3 py-2 text-sm text-laria-ink outline-none focus-visible:ring-2 focus-visible:ring-laria-blue" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="laria-button-secondary min-h-10 px-4 py-2 text-xs disabled:opacity-50">
              {busy ? "Enviando…" : "Enviar reporte"}
            </button>
            <button type="button" onClick={() => {
              restoreFocusRef.current = true;
              setMessage("");
              setOpen(false);
            }} className="min-h-10 rounded-md border border-laria-steel px-4 py-2 text-xs font-black text-laria-ink">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
