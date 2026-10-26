"use client";

import { useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { shareTextUrl } from "@/lib/contact-message";

// A link someone hands out (a seller page, a buyer card): send it by WhatsApp or copy it. The status line says what
// happened; when the clipboard is blocked the link stays visible to copy by hand.
export function CopyLink({ url, label, whatsappText }: { url: string; label: string; whatsappText?: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Enlace copiado.");
    } catch {
      setMessage("Copia el enlace de la casilla.");
    }
  }
  return (
    <div className="grid gap-2">
      <input
        readOnly
        value={url}
        aria-label={label}
        onFocus={(event) => event.currentTarget.select()}
        className="h-11 w-full min-w-0 rounded-control border border-line-strong bg-canvas px-3 t-ui text-ink"
      />
      <div className="flex flex-wrap gap-2">
        {whatsappText ? (
          <a href={shareTextUrl(`${whatsappText} ${url}`)} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Enviar por WhatsApp
          </a>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => void copy()}>Copiar enlace</Button>
      </div>
      <p role="status" className="t-meta empty:hidden">{message}</p>
    </div>
  );
}
