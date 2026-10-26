"use client";

import { Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClasses } from "@/components/ui/button";

// "Compartir" for a discovery page (a collection, a guide, the gift finder): the phone's share sheet where there is
// one, otherwise "Copiar enlace". Nothing is sent anywhere by Laria.
export function SharePageButton({ url, title }: { url: string; title: string }) {
  const [canShare, setCanShare] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function share() {
    setStatus("");
    if (canShare) {
      try {
        await navigator.share({ title, text: `${title} en Laria`, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Enlace copiado.");
    } catch {
      setStatus("No pudimos copiar el enlace. Cópialo desde la barra del navegador.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={share} className={buttonClasses({ variant: "secondary", size: "sm" })}>
        {canShare ? <Share2 aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
        {canShare ? "Compartir" : "Copiar enlace"}
      </button>
      <p role="status" aria-live="polite" className="t-meta">{status}</p>
    </div>
  );
}
