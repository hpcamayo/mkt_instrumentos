"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImportPhotos } from "@/components/store-import/import-photos";
import { ImportPublish } from "@/components/store-import/import-publish";

// stock-10 (Effortless Laria, stores): "Publicar seleccionados" in Inventario's bulk bar. Only SKU without a
// publication are sent; the server stages them and the page below handles photos, missing data and the allowance.
export function PublishSelectedButton({ itemIds, className }: { itemIds: string[]; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!itemIds.length) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const response = await fetch("/api/store/imports/publish-selection", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemIds }),
          }).catch(() => null);
          const body = await response?.json().catch(() => null);
          if (!response?.ok || !body?.id) {
            setBusy(false);
            setError(body?.message ?? "No pudimos preparar la publicación. Intenta de nuevo.");
            return;
          }
          router.push(`/mi-cuenta/tienda/publicar-seleccionados/${body.id}`);
        }}
      >
        {busy ? "Preparando…" : `Publicar seleccionados (${itemIds.length})`}
      </button>
      {error ? <span role="alert" className="t-ui text-danger">{error}</span> : null}
    </>
  );
}

// The two steps: photos (with the phone photo session), then the publication list with "Completar datos".
export function PublishSelection({ sessionId }: { sessionId: string }) {
  const [step, setStep] = useState<"photos" | "publish">("photos");
  return step === "photos" ? (
    <div className="grid gap-4">
      <ImportPhotos sessionId={sessionId} onContinue={() => { setStep("publish"); window.scrollTo({ top: 0 }); }} continueLabel="Continuar a publicar" />
    </div>
  ) : (
    <div className="grid gap-4">
      <ImportPublish sessionId={sessionId} />
      <div><Button variant="secondary" onClick={() => setStep("photos")}>Volver a las fotos</Button></div>
    </div>
  );
}
