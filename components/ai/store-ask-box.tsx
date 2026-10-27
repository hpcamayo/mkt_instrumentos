"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { STORE_QUESTION_MAX } from "@/lib/ai/store-question";
import { cn } from "@/lib/utils";

// stock-24, "Pregúntale a tu tienda" (docs/ux-effortless/maybes-ai.md): a question in plain words opens the filters,
// the Estadísticas view or the Reposición list that answer it, where "Así lo entendí" says what was used. Shown only
// when the server has the AI helpers on and the store has Inventario.
export function StoreAskBox({ className }: { className?: string }) {
  const router = useRouter();
  const id = useId();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (busy || navigating) return;
    if (text.length < 3) {
      setMessage({ tone: "danger", text: "Escribe tu pregunta, por ejemplo «¿qué guitarras tengo agotadas?»." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/store/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const body = (await response.json().catch(() => null)) as { href?: string | null; message?: string } | null;
      if (response.ok && body?.href) {
        const href = body.href;
        startNavigation(() => router.push(href));
        return;
      }
      setMessage({ tone: response.ok ? "info" : "danger", text: body?.message ?? "No pudimos responder en este momento. Usa los filtros o vuelve a intentarlo." });
    } catch {
      setMessage({ tone: "danger", text: "No hay conexión. Revisa tu internet y vuelve a intentarlo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className={cn("grid gap-2 border-b border-subtle p-4 md:p-5", className)}>
      <h2 id={`${id}-titulo`} className="flex items-center gap-1.5 t-ui font-semibold text-ink">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        Pregúntale a tu tienda
      </h2>
      <form onSubmit={ask} className="flex flex-wrap items-end gap-2" aria-busy={busy || navigating}>
        <Field id={`${id}-pregunta`} label="Tu pregunta" labelClassName="sr-only" className="min-w-0 flex-1 basis-64">
          <Input
            name="pregunta"
            value={question}
            maxLength={STORE_QUESTION_MAX}
            autoComplete="off"
            enterKeyHint="search"
            placeholder="Ej.: ¿qué guitarras tengo agotadas?"
            onChange={(event) => setQuestion(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="secondary" loading={busy || navigating} loadingLabel="Buscando…">Preguntar</Button>
      </form>
      {message ? <p role={message.tone === "danger" ? "alert" : "status"} className={cn("t-meta", message.tone === "danger" ? "text-danger" : "text-ink")}>{message.text}</p> : null}
      <p className="t-meta text-ink-2">Tu pregunta se envía a un servicio de IA para elegir los filtros; los datos de tu inventario, no.</p>
    </section>
  );
}
