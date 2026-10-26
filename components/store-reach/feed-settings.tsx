"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// reach-02 "Catálogo para redes": the store's switch and the link it pastes into Meta Commerce Manager. Off by default;
// turning it off is one press and the link stops working at Meta's next read.
export function FeedSwitch({ enabled, feedUrl, canEnable }: { enabled: boolean; feedUrl: string; canEnable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(next: boolean) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/store/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setBusy(false);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(result?.message ?? "No se pudo guardar. Intenta nuevamente.");
      return;
    }
    setMessage(next ? "Catálogo activo. Copia el enlace y pégalo en Meta." : "Catálogo desactivado. Meta dejará de recibir tus instrumentos en su siguiente lectura.");
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setMessage("Enlace copiado.");
    } catch {
      setMessage("Copia el enlace de la casilla.");
    }
  }

  return (
    <div className="grid gap-3">
      {enabled ? (
        <>
          <label className="grid gap-1">
            <span className="t-ui font-semibold text-ink">Enlace de tu catálogo</span>
            <input
              readOnly
              value={feedUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="h-11 w-full rounded-control border border-line-strong bg-canvas px-3 t-ui text-ink"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy()}>Copiar enlace</Button>
            <Button size="sm" variant="secondary" onClick={() => void save(false)} loading={busy} loadingLabel="Desactivando…">Desactivar catálogo</Button>
          </div>
        </>
      ) : (
        <Button className="justify-self-start" onClick={() => void save(true)} disabled={!canEnable} loading={busy} loadingLabel="Activando…">
          Activar catálogo
        </Button>
      )}
      {message ? <p role="status" className="t-meta text-ink">{message}</p> : null}
    </div>
  );
}
