"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";

// save-11: "Compartir lista" makes one link to the account's public favorites (with notes), to send by WhatsApp.
// Anyone with the link sees the owner's first name and the public listings; "Dejar de compartir" turns it off.
export function ShareFavorites({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function call(action: "create" | "revoke") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/favorites/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage("No se pudo actualizar el enlace. Intenta nuevamente.");
      return;
    }
    const result = await response.json();
    setUrl(action === "create" ? result.url : null);
    setMessage(action === "create" ? "Enlace listo." : "Dejaste de compartir tu lista. El enlace anterior ya no funciona.");
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado.");
    } catch {
      setMessage("Copia el enlace de la casilla.");
    }
  }

  return (
    <section aria-labelledby="compartir-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <div>
        <h2 id="compartir-titulo" className="t-ui font-semibold text-ink">Compartir lista</h2>
        <p className="t-meta">Para pedir opinión a tu profe o a tu banda. Verán tu nombre de pila, tus favoritos publicados y tus notas.</p>
      </div>
      {url ? (
        <>
          <input readOnly value={url} aria-label="Enlace de tu lista" onFocus={(event) => event.currentTarget.select()} className="h-11 w-full rounded-control border border-line-strong bg-canvas px-3 t-ui text-ink" />
          <div className="flex flex-wrap gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(`Mira mi lista de instrumentos en Laria: ${url}`)}`} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "sm" })}>Enviar por WhatsApp</a>
            <Button size="sm" variant="secondary" onClick={() => void copy()}>Copiar enlace</Button>
            <Button size="sm" variant="quiet" onClick={() => void call("revoke")} disabled={busy}>Dejar de compartir</Button>
          </div>
        </>
      ) : (
        <Button size="sm" variant="secondary" icon={<Share2 aria-hidden />} className="justify-self-start" onClick={() => void call("create")} loading={busy} loadingLabel="Creando enlace…">Crear enlace para compartir</Button>
      )}
      {message ? <p role="status" className="t-meta">{message}</p> : null}
    </section>
  );
}
