"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, parseWholeSolPrice } from "@/lib/price";
import { formatLimaDateTime, type PrivateOfferAudience } from "@/lib/selling-tools";

// sell-05 "Oferta a interesados": one private price for everyone who saved the listing, for a few days. The public
// price does not change. Once a week per listing, so it stays real news.
export function PrivateOfferPanel({ listingId, audience }: { listingId: string; audience: PrivateOfferAudience | null }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const price = audience?.price_pen ?? null;
  const [amount, setAmount] = useState(price ? String(Math.round(price * 0.93)) : "");
  const [days, setDays] = useState("3");
  const [message, setMessage] = useState("");
  const [amountError, setAmountError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const last = audience?.last_offer ?? null;
  const active = last && last.status === "active" && Date.parse(last.valid_until) > Date.now() ? last : null;
  const waitUntil = audience?.next_allowed_at && Date.parse(audience.next_allowed_at) > Date.now() ? audience.next_allowed_at : null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = parseWholeSolPrice(amount);
    if (!value || !price || value >= price) return setAmountError("La oferta debe ser menor que el precio publicado.");
    setAmountError("");
    const result = await run<{ recipients: number }>("send_private_offer", { p_listing_id: listingId, p_price_pen: value, p_days: Number(days), p_message: message.trim() || null },
      "No pudimos enviar la oferta. Inténtalo de nuevo.");
    if (result) {
      setSent(`Oferta enviada a ${result.recipients === 1 ? "1 persona" : `${result.recipients} personas`}.`);
      router.refresh();
    }
  }

  async function cancel() {
    if (active && await run("cancel_private_offer", { p_offer_id: active.id }, "No pudimos retirar la oferta. Inténtalo de nuevo.")) router.refresh();
  }

  return (
    <section aria-labelledby="oferta-interesados" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
      <h2 id="oferta-interesados" className="t-section text-ink">Oferta a interesados</h2>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {sent ? <Notice tone="success">{sent}</Notice> : null}
      {!audience?.is_public ? (
        <p className="t-ui text-ink-2">Disponible cuando la publicación esté en línea.</p>
      ) : active ? (
        <>
          <p className="t-body text-ink">
            {active.recipient_count === 1 ? "1 persona tiene" : `${active.recipient_count} personas tienen`} tu oferta de <strong>{formatPrice(active.price_pen)}</strong> hasta el {formatLimaDateTime(active.valid_until)}. El precio publicado sigue en {formatPrice(price)}.
          </p>
          <Button variant="quiet" className="w-fit" onClick={cancel} loading={busy === "cancel_private_offer"} loadingLabel="Retirando">Retirar oferta</Button>
        </>
      ) : !audience.saves ? (
        <p className="t-ui text-ink-2">Nadie guardó esta publicación todavía. Cuando alguien lo haga, podrás enviarle un precio especial.</p>
      ) : waitUntil ? (
        <p className="t-ui text-ink-2">Ya enviaste una oferta esta semana. Podrás enviar otra desde el {formatLimaDateTime(waitUntil)}.</p>
      ) : (
        <form onSubmit={send} className="grid gap-3">
          <p className="t-ui text-ink-2">
            {audience.saves === 1 ? "1 persona guardó" : `${audience.saves} personas guardaron`} esta publicación. Envíales un precio solo para ellas por unos días; el precio publicado no cambia. Responden por WhatsApp y tú decides.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="oferta-precio" label="Precio de la oferta" error={amountError} hint={price ? `Publicado: ${formatPrice(price)}` : undefined}>
              <PriceInput value={amount} onValueChange={setAmount} />
            </Field>
            <Field id="oferta-dias" label="Vale por">
              <Select value={days} onChange={(event) => setDays(event.target.value)}>
                {[1, 2, 3, 5, 7].map((value) => <option key={value} value={value}>{value === 1 ? "Hoy y mañana" : `${value} días`}</option>)}
              </Select>
            </Field>
          </div>
          <Field id="oferta-mensaje" label="Mensaje" optional hint="Sin teléfonos ni enlaces.">
            <Textarea value={message} maxLength={200} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" className="w-fit" loading={busy === "send_private_offer"} loadingLabel="Enviando">Enviar oferta</Button>
        </form>
      )}
    </section>
  );
}
