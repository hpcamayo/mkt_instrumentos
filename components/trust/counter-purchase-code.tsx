"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { QrCode } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CopyLink } from "@/components/trust/copy-link";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { counterPurchaseUrl, readCounterCode, readCounterCodeStatus, trustErrorMessage, type CounterCode, type CounterCodeStatus } from "@/lib/deal-trust";
import { qrModules, qrSvgPath, qrVersionFor } from "@/lib/labels/qr";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// «Compra en tienda verificada» (reach-11) at the Mostrador: after a sale in the store, the owner can show the customer
// a one-time code. The customer scans it with their phone, signs in to Laria and confirms the purchase; it becomes a
// verified purchase, and both can review each other. The code works once, for 24 hours, and closes when the sale is
// undone. Showing it again makes a new code (the old one stops working).

const POLL_MS = 4000;

export function CounterPurchaseOffer({ saleKey, storeName, onDismiss }: { saleKey: string; storeName: string; onDismiss: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <div className="grid gap-2 rounded-control border border-subtle bg-canvas p-3">
      <p className="t-ui text-ink">
        ¿El cliente tiene cuenta en Laria? Muéstrale un código para que confirme su compra y pueda dejarte una reseña.
      </p>
      <div className="flex flex-wrap gap-2">
        <button ref={opener} type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 t-ui font-semibold text-ink hover:bg-canvas [&_svg]:h-4 [&_svg]:w-4">
          <QrCode aria-hidden />
          Mostrar código al cliente
        </button>
        <Button variant="quiet" size="sm" onClick={onDismiss}>No, gracias</Button>
      </div>
      {open ? (
        <CounterCodeSheet
          saleKey={saleKey}
          storeName={storeName}
          onDismiss={() => {
            setOpen(false);
            opener.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function CounterCodeSheet({ saleKey, storeName, onDismiss }: { saleKey: string; storeName: string; onDismiss: () => void }) {
  const [code, setCode] = useState<CounterCode | null>(null);
  const [status, setStatus] = useState<CounterCodeStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let active = true;
    void (supabase as unknown as SupabaseClient).rpc("create_counter_purchase_code", { p_sale_key: saleKey }).then(({ data, error: rpcError }) => {
      if (!active) return;
      const next = rpcError ? null : readCounterCode(data);
      if (next) setCode(next);
      else setError(trustErrorMessage(rpcError?.message));
    });
    return () => {
      active = false;
    };
  }, [saleKey]);

  const state = status?.status ?? "open";
  useEffect(() => {
    if (!code || state !== "open") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const timer = window.setInterval(() => {
      void (supabase as unknown as SupabaseClient).rpc("get_counter_purchase_code_status", { p_sale_id: code.saleId }).then(({ data }) => {
        const next = readCounterCodeStatus(data);
        if (next) setStatus(next);
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [code, state]);

  async function cancel() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !code) return;
    setBusy(true);
    const { error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("cancel_counter_purchase_code", { p_sale_id: code.saleId });
    setBusy(false);
    if (rpcError) setError(trustErrorMessage(rpcError.message));
    else setStatus({ status: "cancelled", buyerName: null, transactionId: null, expiresAt: code.expiresAt });
  }

  const url = code ? counterPurchaseUrl(code.token) : null;
  return (
    <Sheet
      title="Código para el cliente"
      closeLabel="Cerrar"
      layout="responsive"
      onDismiss={onDismiss}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          {code && state === "open" ? <Button variant="quiet" loading={busy} onClick={() => void cancel()}>Cerrar el código</Button> : null}
          <Button variant="secondary" onClick={onDismiss}>Listo</Button>
        </div>
      )}
    >
      {error ? <p role="alert" className="mt-3 t-ui font-semibold text-danger">{error}</p> : null}
      {!code && !error ? <p role="status" className="mt-3 t-ui text-ink-2">Preparando el código…</p> : null}
      {code && url ? (
        state === "claimed" ? (
          <div role="status" className="mt-3 grid gap-1">
            <p className="t-section text-ink">Compra confirmada</p>
            <p className="t-ui text-ink-2">
              {status?.buyerName ?? "El cliente"} confirmó su compra en {storeName}. Los dos pueden dejar una reseña durante 10 días
              desde Compras y ventas.
            </p>
          </div>
        ) : state === "open" ? (
          <div className="mt-3 grid justify-items-center gap-3">
            <p className="t-ui text-ink">Pide al cliente que lo escanee con la cámara de su celular.</p>
            <SaleQr text={url} />
            <p className="t-meta">Sirve una sola vez, hasta {formatTime(code.expiresAt)}. Si deshaces la venta, el código se cierra.</p>
            <div className="w-full"><CopyLink url={url} label="Enlace para confirmar la compra" whatsappText={`Confirma tu compra en ${storeName} en Laria:`} /></div>
            <p className="t-meta" role="status">Esperando a que el cliente confirme…</p>
          </div>
        ) : (
          <p role="status" className="mt-3 t-ui text-ink-2">
            {state === "cancelled" ? "Cerraste el código. Ya no sirve." : "El código venció."}
          </p>
        )
      ) : null}
    </Sheet>
  );
}

// The QR as an SVG: black modules on white with the four-module quiet zone, whatever the page's theme, so any phone
// reads it.
export function SaleQr({ text }: { text: string }) {
  // store-floor's encoder (lib/labels/qr.ts); a claim link is far below its 213-byte limit.
  const path = useMemo(() => (qrVersionFor(text) ? qrSvgPath(qrModules(text)) : null), [text]);
  if (!path) return null;
  return (
    <svg
      viewBox={`0 0 ${path.size} ${path.size}`}
      role="img"
      aria-label="Código QR para confirmar la compra"
      shapeRendering="crispEdges"
      className="h-60 w-60 max-w-full rounded-control border border-subtle"
    >
      <rect width={path.size} height={path.size} fill="white" />
      <path d={path.path} fill="black" />
    </svg>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-PE", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value));
}
