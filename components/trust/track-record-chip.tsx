"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { loadTrackRecord, setTrackRecord, toggleTrackRecordFor, useTrackRecord, useTrackRecordIncluded } from "@/components/trust/track-record-state";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { formatAverage, readTrackRecord, trackRecordLine, trustErrorMessage, type TrackRecord } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

// «Comprador con historial» (safe-07) beside the quick questions: for a signed-in buyer with at least one purchase
// confirmed in Laria. Off by default: the first press asks for consent and turns the card on; after that the line is in
// every message unless the buyer takes it out of this one.
export function TrackRecordChip({ listingId, className }: { listingId: string; className?: string }) {
  const account = useMarketplaceAccount();
  const { record } = useTrackRecord();
  const included = useTrackRecordIncluded(listingId);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    if (account.ready && account.authenticated) loadTrackRecord();
  }, [account.ready, account.authenticated]);

  if (!account.authenticated || !record || record.verifiedPurchases < 1) return null;
  const on = record.enabled && included;
  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex flex-wrap gap-2">
        <Chip selected={on} onClick={() => (record.enabled ? toggleTrackRecordFor(listingId) : setConsent(true))}>
          Incluir mi historial de comprador
        </Chip>
      </div>
      {on ? <p className="t-meta">Se agrega un enlace a tu tarjeta de comprador. Quítalo si prefieres no mostrarlo.</p> : null}
      {consent ? <TrackRecordConsent record={record} onDone={() => setConsent(false)} /> : null}
    </div>
  );
}

export function TrackRecordFacts({ record }: { record: TrackRecord }) {
  return (
    <ul className="grid list-disc gap-1 pl-5 t-ui text-ink">
      <li>Tu nombre de pila: {record.firstName}</li>
      <li>Desde cuándo compras en Laria</li>
      <li>{record.verifiedPurchases === 1 ? "1 compra confirmada en Laria" : `${record.verifiedPurchases} compras confirmadas en Laria`}</li>
      {record.ratingCount > 0 && record.averageRating !== null ? (
        <li>La nota que te dieron los vendedores: {formatAverage(record.averageRating)} de 5</li>
      ) : null}
    </ul>
  );
}

// The consent sheet: what the card shows and what it never shows, then one press turns it on.
export function TrackRecordConsent({ record, onDone }: { record: TrackRecord; onDone: (record: TrackRecord | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enable() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("set_my_track_record", { p_enabled: true });
    setBusy(false);
    const next = rpcError ? null : readTrackRecord(data);
    if (!next) {
      setError(trustErrorMessage(rpcError?.message ?? "TRACK_RECORD"));
      return;
    }
    setTrackRecord(next);
    onDone(next);
  }
  const preview = trackRecordLine({ ...record, enabled: true, token: record.token ?? "000000000000000000000000" });
  return (
    <Sheet
      title="Mostrar tu historial de comprador"
      closeLabel="Cerrar"
      layout="responsive"
      onDismiss={() => onDone(null)}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onDone(null)}>Ahora no</Button>
          <Button onClick={() => void enable()} loading={busy} loadingLabel="Guardando…">Mostrar mi historial</Button>
        </div>
      )}
    >
      <p className="mt-3 t-body text-ink">
        Quien vende recibe en tu mensaje un enlace a tu tarjeta de comprador. Ayuda a que te respondan con confianza.
      </p>
      <p className="mt-3 t-ui font-semibold text-ink">La tarjeta muestra:</p>
      <div className="mt-1"><TrackRecordFacts record={record} /></div>
      <p className="mt-3 t-meta">
        Nunca muestra tu teléfono, tu correo ni qué compraste. Puedes quitar el enlace de cada mensaje y apagarlo cuando
        quieras en Compras y ventas; al apagarlo, el enlace deja de funcionar.
      </p>
      {preview ? <p className="mt-3 rounded-control bg-canvas p-3 t-meta text-ink">Se agregará: {preview.replace(/0{24}$/, "…")}</p> : null}
      {error ? <p role="alert" className="mt-3 t-ui font-semibold text-danger">{error}</p> : null}
    </Sheet>
  );
}
