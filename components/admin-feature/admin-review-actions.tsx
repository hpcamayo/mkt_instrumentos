"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type Option = { status: string; label: string; variant?: "primary" | "secondary" | "danger"; needsNote?: boolean };

// Feature ideas, accounts batch: the decision buttons of the Admin pages for photo copies and reported equipment, with
// an optional note (required where an option says so). Every decision is kept with its note and reviewer.
export function AdminReviewActions({ endpoint, body, options, noteLabel = "Nota (opcional)", done }: {
  endpoint: string;
  body: Record<string, unknown>;
  options: Option[];
  noteLabel?: string;
  done: string;
}) {
  const router = useRouter();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function decide(option: Option) {
    if (option.needsNote && note.trim().length < 3) return setMessage({ tone: "danger", text: "Indica el motivo en la nota." });
    setBusy(option.status);
    setMessage(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, status: option.status, note }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setBusy(null);
    if (!response?.ok || !payload?.ok) return setMessage({ tone: "danger", text: payload?.message ?? "No se pudo guardar." });
    setMessage({ tone: "success", text: done });
    router.refresh();
  }

  return (
    <div className="grid gap-3">
      <Field id={noteId} label={noteLabel}>
        <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button key={option.status} type="button" variant={option.variant ?? "secondary"} onClick={() => void decide(option)} loading={busy === option.status} loadingLabel="Guardando…" disabled={busy !== null}>
            {option.label}
          </Button>
        ))}
      </div>
      {message ? <Notice tone={message.tone}><p>{message.text}</p></Notice> : null}
    </div>
  );
}
