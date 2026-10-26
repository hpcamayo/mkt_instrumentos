"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { HELP_TICKET_TOPICS } from "@/lib/help/articles";

// safe-10 (accounts batch): "¿No encontraste tu respuesta?". The message reaches Admin's help queue; the answer comes by
// e-mail (and in "Mis consultas" when the person is signed in).
export function HelpTicketForm({ account, topic, pagePath }: { account: { name: string; email: string } | null; topic: string | null; pagePath: string | null }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const initialTopic = HELP_TICKET_TOPICS.some((item) => item.id === topic) ? topic! : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = {
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      topic: String(data.get("topic") ?? ""),
      message: String(data.get("message") ?? "").trim(),
    };
    const found: Record<string, string> = {};
    if (values.name.length < 2) found.name = "Escribe tu nombre.";
    if (!account && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) found.email = "Escribe un correo válido para responderte.";
    if (!values.topic) found.topic = "Elige un tema.";
    if (values.message.length < 10) found.message = "Cuéntanos un poco más (al menos 10 caracteres).";
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const response = await fetch("/api/help/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, email: account ? null : values.email, page_path: pagePath }),
    }).catch(() => null);
    const result = (await response?.json().catch(() => null)) as { code?: string; message?: string } | null;
    setBusy(false);
    if (!response?.ok || !result?.code) return setFailure(result?.message ?? "No pudimos enviar tu consulta. Vuelve a intentarlo.");
    setSent(result.code);
  }

  if (sent) {
    return (
      <Notice tone="success" title={`Recibimos tu consulta ${sent}`}>
        <p>
          Te responderemos a {account?.email ?? "tu correo"}.
          {account ? <> También la verás en <Link href="/ayuda/mis-consultas">Mis consultas</Link>.</> : null}
        </p>
      </Notice>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="help-name" label="Tu nombre" error={errors.name}>
          <Input name="name" autoComplete="name" defaultValue={account?.name ?? ""} required />
        </Field>
        {account ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="t-ui font-semibold text-ink">Te respondemos a</p>
            <p className="flex min-h-11 items-center break-all t-body text-ink-2">{account.email}</p>
          </div>
        ) : (
          <Field id="help-email" label="Tu correo" error={errors.email}>
            <Input name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
        )}
      </div>
      <Field id="help-topic" label="Tema" error={errors.topic}>
        <Select name="topic" defaultValue={initialTopic} required>
          <option value="" disabled>Elige un tema</option>
          {HELP_TICKET_TOPICS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Field id="help-message" label="Tu consulta" hint="No incluyas contraseñas ni códigos de verificación." error={errors.message}>
        <Textarea name="message" rows={5} maxLength={3000} required />
      </Field>
      {failure ? <Notice tone="danger"><p>{failure}</p></Notice> : null}
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Enviando…">Enviar consulta</Button>
    </form>
  );
}
