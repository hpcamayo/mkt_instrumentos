"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Clock, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";

export type AdminHelpTicketRow = {
  id: string;
  code: string;
  name: string;
  email: string;
  has_account: boolean;
  topic: string;
  topic_label: string;
  message: string;
  page_path: string | null;
  status: "abierto" | "respondido" | "cerrado";
  answer: string | null;
  created_label: string;
};

type Action = "answer" | "answer_close" | "close" | "reopen";

// safe-10 (accounts batch): one help-center question in Admin. A question from an account gets the answer by e-mail
// and in "Mis consultas"; one sent without an account is answered from Admin's own mailbox (the link opens it).
export function AdminHelpTicket({ row }: { row: AdminHelpTicketRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [mailto, setMailto] = useState<string | null>(null);

  async function run(action: Action, answer?: string) {
    setBusy(action);
    setMessage(null);
    const response = await fetch("/api/admin/help-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: row.id, action, answer }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; message?: string; result?: { emailed?: boolean; email?: string | null } } | null;
    setBusy(null);
    if (!response?.ok || !payload?.ok) return setMessage({ tone: "danger", text: payload?.message ?? "No se pudo guardar." });
    if (payload.result && !payload.result.emailed && payload.result.email && answer) {
      const subject = encodeURIComponent(`Tu consulta ${row.code} en Laria`);
      const text = encodeURIComponent(`Hola ${row.name}:\n\n${answer}\n\nEquipo de Laria`);
      setMailto(`mailto:${payload.result.email}?subject=${subject}&body=${text}`);
      setMessage({ tone: "success", text: "Respuesta guardada. Esta consulta llegó sin cuenta: envíala desde tu correo." });
      return;
    }
    setMessage({ tone: "success", text: action === "close" ? "Consulta cerrada." : action === "reopen" ? "Consulta reabierta." : "Respuesta enviada por correo." });
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = (submitter?.value ?? "answer") as Action;
    const answer = String(new FormData(event.currentTarget).get("answer") ?? "").trim();
    if (answer.length < 3) return setMessage({ tone: "danger", text: "Escribe la respuesta." });
    void run(action, answer);
  }

  return (
    <li className="rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-section text-ink">{row.code} · {row.topic_label}</p>
          <p className="t-ui text-ink-2">
            {row.name} · <span className="break-all">{row.email}</span> · {row.has_account ? "con cuenta" : "sin cuenta"}
          </p>
          <p className="t-meta">{row.created_label}{row.page_path ? ` · desde ${row.page_path}` : ""}</p>
        </div>
        <Tag tone={row.status === "abierto" ? "warning" : "neutral"} icon={row.status === "abierto" ? <Clock aria-hidden /> : row.status === "respondido" ? <Check aria-hidden /> : <X aria-hidden />}>
          {row.status === "abierto" ? "Sin responder" : row.status === "respondido" ? "Respondida" : "Cerrada"}
        </Tag>
      </div>
      <p className="mt-3 max-w-[68ch] whitespace-pre-line t-body text-ink">{row.message}</p>
      {row.answer ? (
        <div className="mt-3 rounded-panel bg-accent-tint p-3">
          <p className="t-ui font-semibold text-ink">Respuesta</p>
          <p className="mt-1 whitespace-pre-line t-body text-ink">{row.answer}</p>
        </div>
      ) : null}
      {row.status !== "cerrado" ? (
        <form noValidate onSubmit={submit} className="mt-4 grid gap-3">
          <Field id={`answer-${row.id}`} label={row.answer ? "Nueva respuesta" : "Respuesta"} hint={row.has_account ? "Le llega por correo y en Mis consultas." : "Se guarda aquí; luego la envías desde tu correo."}>
            <Textarea name="answer" rows={4} maxLength={4000} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" value="answer" loading={busy === "answer"} loadingLabel="Guardando…" disabled={busy !== null}>Responder</Button>
            <Button type="submit" value="answer_close" variant="secondary" loading={busy === "answer_close"} loadingLabel="Guardando…" disabled={busy !== null}>Responder y cerrar</Button>
            <Button type="button" variant="quiet" onClick={() => void run("close")} disabled={busy !== null}>Cerrar sin responder</Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={() => void run("reopen")} disabled={busy !== null}>Reabrir</Button>
      )}
      {message ? <Notice tone={message.tone} className="mt-3"><p>{message.text}</p></Notice> : null}
      {mailto ? <a href={mailto} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>Abrir mi correo con la respuesta</a> : null}
    </li>
  );
}
