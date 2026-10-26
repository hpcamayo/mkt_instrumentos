"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

type Counts = { total: number; pending: number; done: number; failed: number; accepting: boolean };

// reach-01 "Importar desde Mercado Libre" (docs/feature-ideas/store-reach.md): in the import's photo step, the photos
// of the publications brought from Mercado Libre. Nothing happens until the store presses the button; each call copies
// a few, checked like any other photo and matched to their SKU and order. Renders nothing for any other import.
export function MercadoLibrePhotos({ sessionId, onCopied }: { sessionId: string; onCopied: () => void | Promise<void> }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/store/mercado-libre/photos?importacion=${sessionId}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => { if (!cancelled && payload?.ok) setCounts(payload.counts); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [sessionId]);

  if (!counts || counts.total === 0) return null;

  async function copy() {
    setBusy(true);
    setMessage(null);
    try {
      for (let round = 0; round < 200; round += 1) {
        const response = await fetch("/api/store/mercado-libre/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          setMessage(payload?.message ?? "No pudimos traer las fotos. Vuelve a intentarlo.");
          break;
        }
        setCounts(payload.counts);
        if (!payload.counts.pending) break;
      }
    } catch {
      setMessage("No pudimos traer las fotos. Revisa tu conexión y vuelve a intentarlo.");
    } finally {
      setBusy(false);
      await onCopied();
    }
  }

  return (
    <section aria-labelledby="fotos-mercado-libre" className="grid gap-3 rounded-panel border border-subtle bg-surface p-4">
      <h3 id="fotos-mercado-libre" className="t-ui font-semibold text-ink">Fotos de Mercado Libre</h3>
      <p className="t-body text-ink-2" aria-live="polite">
        {counts.done} de {counts.total} copiadas
        {counts.failed ? `; ${counts.failed} no se pudieron usar (puedes subir otras abajo)` : ""}.
      </p>
      {counts.pending ? (
        <Button onClick={() => void copy()} loading={busy} loadingLabel={`Copiando… ${counts.done + counts.failed} de ${counts.total}`} className="justify-self-start">
          Traer fotos de Mercado Libre
        </Button>
      ) : null}
      {message ? <Notice tone="danger" role="alert">{message}</Notice> : null}
    </section>
  );
}
