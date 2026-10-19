"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// save-11: an optional note on a favorite ("pregúntale a tu profe"). Shown on the shared list.
export function FavoriteNote({ listingId, initialNote }: { listingId: string; initialNote: string | null }) {
  const [note, setNote] = useState(initialNote ?? "");
  const [draft, setDraft] = useState(initialNote ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `nota-${listingId}`;

  async function save() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "note", id: listingId, note: draft }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("No se pudo guardar la nota.");
      return;
    }
    const result = await response.json();
    setNote(result.note ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="grid w-full gap-1">
        {note ? <p className="t-meta"><span className="font-semibold text-ink">Nota:</span> {note}</p> : null}
        <Button variant="quiet" size="sm" className="justify-self-start" onClick={() => { setDraft(note); setEditing(true); }}>
          {note ? "Editar nota" : "Añadir nota"}
        </Button>
      </div>
    );
  }
  return (
    <div className="grid w-full gap-2">
      <label htmlFor={id} className="t-ui font-semibold text-ink">Nota para tu lista</label>
      <Textarea id={id} value={draft} maxLength={280} onChange={(event) => setDraft(event.target.value)} className="min-h-20" placeholder="Por ejemplo: preguntarle al profe por el mástil" />
      {error ? <p role="alert" className="t-meta text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} loading={busy} loadingLabel="Guardando…">Guardar nota</Button>
        <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
      </div>
    </div>
  );
}
