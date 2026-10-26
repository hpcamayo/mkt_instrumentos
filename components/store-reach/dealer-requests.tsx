"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FileInput, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { DEALER_DOCUMENT_MAX_BYTES, DEALER_DOCUMENT_TYPES, DEALER_STATUS_LABELS, formatDealerDate, type DealerAuthorization } from "@/lib/dealers";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// reach-04 "Distribuidor oficial": the owner sends a brand's authorization (brand, document, optional end date and
// note). The browser uploads the file straight to the private bucket path the database issued; the server then checks
// the bytes before the request reaches Admin.
export function DealerRequestForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("document");
    const brand = String(data.get("brand") ?? "").trim();
    if (brand.length < 2) return setMessage({ tone: "danger", text: "Escribe la marca como figura en la autorización." });
    if (!(file instanceof File) || !file.size) return setMessage({ tone: "danger", text: "Elige el documento de autorización." });
    if (!(DEALER_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return setMessage({ tone: "danger", text: "Sube la autorización en PDF, JPG, PNG o WebP." });
    if (file.size > DEALER_DOCUMENT_MAX_BYTES) return setMessage({ tone: "danger", text: "El archivo debe pesar como máximo 5 MB." });
    setBusy(true);
    setMessage(null);
    try {
      const opened = await post("/api/store/dealers", {
        action: "request",
        brand,
        fileName: file.name,
        fileType: file.type,
        fileBytes: file.size,
        validUntil: String(data.get("validUntil") ?? "") || null,
        note: String(data.get("note") ?? "").trim() || null,
      });
      if (!opened.ok) return setMessage({ tone: "danger", text: opened.message });
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return setMessage({ tone: "danger", text: "No se pudo subir el archivo. Intenta nuevamente." });
      const { error } = await supabase.storage.from(opened.upload.bucket).upload(opened.upload.path, file, { contentType: file.type, upsert: false });
      if (error) return setMessage({ tone: "danger", text: "No se pudo subir el archivo. Vuelve a intentarlo." });
      const checked = await post(`/api/store/dealers/${opened.authorization.id}/complete`, {});
      if (!checked.ok) return setMessage({ tone: "danger", text: checked.message });
      form.reset();
      setMessage({ tone: "success", text: "Recibimos la autorización. Laria la revisará y te avisará en Notificaciones." });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-marca`} label="Marca" hint="Como figura en el documento, por ejemplo Yamaha.">
          <Input name="brand" required minLength={2} maxLength={60} autoComplete="off" disabled={disabled} />
        </Field>
        <Field id={`${id}-vigencia`} label="Vigente hasta" optional hint="Si el documento indica una fecha de vencimiento.">
          <Input name="validUntil" type="date" disabled={disabled} />
        </Field>
      </div>
      <Field id={`${id}-documento`} label="Documento de autorización" hint="Carta, contrato o certificado de la marca o de su representante en Perú. PDF, JPG, PNG o WebP, hasta 5 MB. Solo lo ve Admin.">
        <FileInput name="document" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={disabled} />
      </Field>
      <Field id={`${id}-nota`} label="Nota para Admin" optional hint="Por ejemplo, quién firma la carta o cómo verificarla.">
        <Input name="note" maxLength={500} disabled={disabled} />
      </Field>
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Enviando…" disabled={disabled}>Enviar autorización</Button>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </form>
  );
}

export function DealerWithdrawButton({ authorization }: { authorization: Pick<DealerAuthorization, "id" | "brand" | "status"> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function withdraw() {
    setBusy(true);
    const result = await post("/api/store/dealers", { action: "withdraw", id: authorization.id });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    router.refresh();
  }
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="secondary" onClick={() => void withdraw()} loading={busy} loadingLabel="Retirando…">
        {authorization.status === "approved" ? `Dejar de mostrar ${authorization.brand}` : "Retirar solicitud"}
      </Button>
      {message ? <p role="alert" className="t-meta text-danger">{message}</p> : null}
    </div>
  );
}

export function DealerStatusLine({ authorization }: { authorization: DealerAuthorization }) {
  const status = authorization.status === "approved" && !authorization.active ? "Vencida" : DEALER_STATUS_LABELS[authorization.status];
  return (
    <p className="t-meta text-ink-2">
      <span className="font-semibold text-ink">{status}</span>
      {authorization.validUntil ? ` · vigente hasta el ${formatDealerDate(authorization.validUntil)}` : ""}
      {authorization.reviewReason ? ` · Motivo: ${authorization.reviewReason}` : ""}
    </p>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(url: string, body: Record<string, unknown>): Promise<any> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: payload?.message ?? "No se pudo completar. Intenta nuevamente." };
    return payload;
  } catch {
    return { ok: false, message: "No se pudo completar. Revisa tu conexión." };
  }
}
