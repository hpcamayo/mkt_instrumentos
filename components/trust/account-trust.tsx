"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { BuyerCardFigures } from "@/components/trust/buyer-card-figures";
import { CopyLink } from "@/components/trust/copy-link";
import { SellerLevelMark } from "@/components/trust/seller-level-mark";
import { TrackRecordConsent } from "@/components/trust/track-record-chip";
import { Button } from "@/components/ui/button";
import { buyerCardUrl } from "@/lib/contact-message";
import {
  LEVEL_CRITERIA,
  levelName,
  levelProgress,
  readMySellerPage,
  readTrackRecord,
  sellerPageUrl,
  trustErrorMessage,
  type LevelFacts,
  type MyLevels,
  type MySellerPage,
  type SellerLevel,
  type TrackRecord,
} from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// «Tu perfil en Laria» in Compras y ventas: the seller page (sell-09), the buyer card (safe-07) and the seller level's
// progress (sell-08). Each card shows only when it applies: a page once something was published as a Particular, the
// buyer card once a purchase was confirmed, the level once there is a confirmed sale or a store.
export function AccountTrust({ sellerPage, trackRecord, levels }: { sellerPage: MySellerPage | null; trackRecord: TrackRecord | null; levels: MyLevels | null }) {
  const showLevels = levels && (levels.particular.facts.verifiedSales > 0 || levels.particular.level || levels.store);
  const showTrack = trackRecord && (trackRecord.verifiedPurchases > 0 || trackRecord.enabled);
  if (!sellerPage && !showTrack && !showLevels) return null;
  return (
    <section aria-labelledby="perfil-laria" className="grid gap-3">
      <div>
        <h2 id="perfil-laria" className="t-section text-ink">Tu perfil en Laria</h2>
        <p className="mt-1 t-ui text-ink-2">Lo que otros ven de ti, a partir de tus compras y ventas confirmadas.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {sellerPage ? <SellerPageCard initial={sellerPage} /> : null}
        {showTrack && trackRecord ? <TrackRecordCard initial={trackRecord} /> : null}
        {showLevels && levels ? <LevelCard kind="particular" facts={levels.particular.facts} level={levels.particular.level} /> : null}
        {levels?.store ? <LevelCard kind="store" facts={levels.store.facts} level={levels.store.level} /> : null}
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid content-start gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <h3 id={id} className="t-ui font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

function SellerPageCard({ initial }: { initial: MySellerPage }) {
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function setHidden(hidden: boolean) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("set_my_seller_page_hidden", { p_hidden: hidden });
    setBusy(false);
    const next = rpcError ? null : readMySellerPage(data);
    if (next) setPage(next);
    else setError(trustErrorMessage(rpcError?.message ?? "SELLER_PAGE"));
  }
  return (
    <Card title="Tu página de vendedor">
      {page.hidden ? (
        <p className="t-ui text-ink-2">Está oculta. Tus publicaciones siguen visibles, pero no enlazan a tu página.</p>
      ) : (
        <>
          <p className="t-ui text-ink-2">
            Muestra tu nombre de pila, tu ciudad, tus ventas confirmadas, tus reseñas y tus publicaciones activas. No muestra tu
            teléfono ni tu apellido, y no aparece en buscadores.
          </p>
          <Link href={`/vendedores/${page.slug}`} className="link w-fit t-ui font-semibold">Ver mi página</Link>
          <CopyLink url={sellerPageUrl(page.slug)} label="Enlace de tu página de vendedor" whatsappText="Mira lo que vendo en Laria:" />
        </>
      )}
      <Button size="sm" variant={page.hidden ? "secondary" : "quiet"} className="w-fit" loading={busy} onClick={() => void setHidden(!page.hidden)}>
        {page.hidden ? "Mostrar mi página" : "Ocultar mi página"}
      </Button>
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
    </Card>
  );
}

function TrackRecordCard({ initial }: { initial: TrackRecord }) {
  const [record, setRecord] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function disable() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await (supabase as unknown as SupabaseClient).rpc("set_my_track_record", { p_enabled: false });
    setBusy(false);
    const next = rpcError ? null : readTrackRecord(data);
    if (next) setRecord(next);
    else setError(trustErrorMessage(rpcError?.message ?? "TRACK_RECORD"));
  }
  return (
    <Card title="Tu historial de comprador">
      {record.enabled && record.token ? (
        <>
          <p className="t-ui text-ink-2">
            Está activado: puedes agregarlo a tus mensajes a vendedores. Tu tarjeta muestra tu nombre de pila,
            {" "}{record.firstName}, y esto:
          </p>
          <BuyerCardFigures card={record} />
          <Link href={`/comprador/${record.token}`} className="link w-fit t-ui font-semibold">Ver mi tarjeta</Link>
          <CopyLink url={buyerCardUrl(record.token)} label="Enlace de tu tarjeta de comprador" />
          <Button size="sm" variant="quiet" className="w-fit" loading={busy} onClick={() => void disable()}>Apagar mi historial</Button>
          <p className="t-meta">Al apagarlo, el enlace deja de funcionar. Si lo vuelves a activar, tendrá un enlace nuevo.</p>
        </>
      ) : (
        <>
          <p className="t-ui text-ink-2">
            Está apagado. Si lo activas, puedes agregar a tus mensajes un enlace con tus compras confirmadas en Laria, para que
            los vendedores te respondan con confianza.
          </p>
          <Button size="sm" variant="secondary" className="w-fit" onClick={() => setConsent(true)}>Activar mi historial</Button>
        </>
      )}
      {error ? <p role="alert" className="t-meta font-semibold text-danger">{error}</p> : null}
      {consent ? <TrackRecordConsent record={record} onDone={(next) => { setConsent(false); if (next) setRecord(next); }} /> : null}
    </Card>
  );
}

function LevelCard({ kind, facts, level }: { kind: SellerLevel["kind"]; facts: LevelFacts; level: SellerLevel | null }) {
  const progress = levelProgress(facts);
  return (
    <Card title={kind === "store" ? `${levelName("store")} (tu tienda)` : levelName("particular")}>
      {level ? <SellerLevelMark level={level} /> : (
        <p className="t-ui text-ink-2">
          Se gana sola cuando cumples todo esto, y se revisa cada noche. {kind === "store" && !facts.storeActive ? "Tu tienda tiene que estar activa." : ""}
        </p>
      )}
      <ul className="grid gap-2">
        {progress.map((item) => (
          <li key={item.label} className="flex items-start gap-2 t-ui">
            {item.met ? <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink" /> : <Circle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />}
            <span className="min-w-0">
              <span className="text-ink">{item.label}: </span>
              <span className="font-semibold text-ink">{item.value}</span>
              <span className="sr-only">{item.met ? " (cumplido)" : " (pendiente)"}</span>
            </span>
          </li>
        ))}
      </ul>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center t-meta font-semibold text-ink">Los criterios completos</summary>
        <ul className="grid list-disc gap-1 pl-5 t-meta">
          {LEVEL_CRITERIA.map((criterion) => <li key={criterion}>{criterion}</li>)}
        </ul>
      </details>
    </Card>
  );
}
