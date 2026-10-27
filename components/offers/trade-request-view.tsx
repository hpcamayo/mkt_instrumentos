"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { TradePhotos } from "@/components/offers/trade-photos";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Price } from "@/components/ui/price";
import { Tag } from "@/components/ui/tag";
import { VerifiedMark } from "@/components/ui/verified-mark";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { getConditionLabel } from "@/lib/listings";
import { buildWhatsAppHref, isValidWhatsAppPhone } from "@/lib/phone";
import { formatPrice } from "@/lib/price";
import { formatCalendarDate, formatLimaDateTime, offerStatusLabel, tradeStatusLabel, type MyTradeRequest } from "@/lib/selling-tools";

// The person's side of one request: the offers as they arrive, best first; choosing one declines the others and
// shows that store's address and WhatsApp. Nothing here is a payment: the store pays at its counter.
export function TradeRequestView({ request, profilePhone, justSent }: { request: MyTradeRequest; profilePhone: string | null; justSent: boolean }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [confirm, confirmDialog] = useConfirm();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [phone, setPhone] = useState(profilePhone ?? "");
  const [phoneError, setPhoneError] = useState("");
  const open = request.status === "open";
  const chosen = request.offers.find((offer) => offer.status === "accepted") ?? null;
  const sell = request.kind === "sell";

  async function accept(offerId: string) {
    if (!isValidWhatsAppPhone(phone)) {
      setPhoneError("Escribe tu WhatsApp, por ejemplo 987 654 321.");
      return;
    }
    const result = await run("accept_trade_offer", { p_offer_id: offerId, p_phone: phone }, "No pudimos elegir la oferta. Inténtalo de nuevo.");
    if (result) {
      setChoosing(null);
      router.refresh();
    }
  }

  async function withdraw() {
    if (!(await confirm({
      title: "¿Retirar este pedido?",
      body: chosen ? `Le avisaremos a ${chosen.store.name} que ya no vas.` : "Las tiendas dejarán de verlo.",
      confirmLabel: "Retirar pedido",
      tone: "danger",
    }))) return;
    if (await run("withdraw_trade_request", { p_request_id: request.id }, "No pudimos retirar el pedido. Inténtalo de nuevo.")) router.refresh();
  }

  return (
    <div className="grid gap-6">
      {confirmDialog}
      {justSent ? (
        <Notice tone="success" title="Pedido enviado">
          {sell
            ? `Lo ven ${request.stores_reached === 1 ? "una tienda verificada" : `${request.stores_reached} tiendas verificadas`} de ${request.region} hasta el ${formatLimaDateTime(request.offers_until)}. Te avisamos con cada oferta.`
            : "La tienda te responderá con un estimado. Te avisamos cuando llegue."}
        </Notice>
      ) : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={open ? "accent" : "neutral"}>{tradeStatusLabel(request.status, request.kind)}</Tag>
        {open ? (
          <span className="t-meta">
            {sell ? `Ofertas hasta el ${formatLimaDateTime(request.offers_until)} · ` : ""}Puedes elegir hasta el {formatLimaDateTime(request.decide_until)}
          </span>
        ) : null}
      </div>

      {chosen && request.status === "accepted" ? (
        <section aria-labelledby="oferta-elegida" className="grid gap-3 rounded-panel border border-line-strong bg-surface p-5">
          <h2 id="oferta-elegida" className="t-section text-ink">Elegiste {chosen.store.name}</h2>
          <p className="t-body text-ink">
            Lleva el equipo a la tienda hasta el <strong>{request.drop_off_by ? formatCalendarDate(request.drop_off_by) : "plazo acordado"}</strong>.
            Allí lo revisan, te confirman el {sell ? "precio" : "valor"} final y {sell ? "te pagan directamente" : "lo descuentan de tu compra"}. La tienda también tiene tu WhatsApp para coordinar.
          </p>
          <p className="t-ui text-ink">{sell ? "Oferta" : "Estimado"}: <strong>{formatPrice(chosen.amount_pen)}</strong>, sujeto a la revisión del equipo.</p>
          {chosen.contact ? (
            <ul className="grid gap-1 t-ui text-ink">
              {chosen.contact.address ? <li>{[chosen.contact.address, chosen.contact.district, chosen.contact.city].filter(Boolean).join(", ")}</li> : null}
              {chosen.contact.opening_hours ? <li>Horario: {chosen.contact.opening_hours}</li> : null}
            </ul>
          ) : null}
          {chosen.contact?.whatsapp_phone ? (
            <a
              href={buildWhatsAppHref(chosen.contact.whatsapp_phone, `Hola, elegí su ${sell ? "oferta" : "estimado"} en Laria por mi ${request.title}. ¿Cuándo puedo llevarlo?`)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "primary", className: "w-fit" })}
            >
              <WhatsAppGlyph />
              Contactar por WhatsApp
            </a>
          ) : null}
        </section>
      ) : null}

      {request.status === "completed" ? (
        <Notice tone="success" title={sell ? "Venta registrada" : "Entrega registrada"}>
          {chosen?.store.name ?? "La tienda"} registró que se concretó{request.final_price_pen ? ` por ${formatPrice(request.final_price_pen)}` : ""}.
        </Notice>
      ) : null}
      {request.status === "not_completed" ? <Notice tone="info">La tienda registró que no se concretó.{request.close_reason ? ` ${request.close_reason}` : ""}</Notice> : null}
      {request.status === "expired" ? <Notice tone="info">El pedido venció. Puedes enviarlo otra vez o publicarlo tú en Laria.</Notice> : null}

      <section aria-labelledby="ofertas-recibidas" className="grid gap-3">
        <h2 id="ofertas-recibidas" className="t-section text-ink">{sell ? "Ofertas" : "Respuesta de la tienda"}</h2>
        {!request.offers.length ? (
          <p className="t-body text-ink-2">
            {open ? (sell ? "Todavía no llegan ofertas. Te avisamos con cada una." : "La tienda todavía no responde. Te avisamos cuando lo haga.") : "No llegaron ofertas."}
          </p>
        ) : (
          <ul className="grid gap-3">
            {request.offers.map((offer) => (
              <li key={offer.id} className="grid gap-2 rounded-panel border border-subtle bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 t-ui font-semibold text-ink">
                      {offer.store.name}
                      {offer.store.is_verified ? <VerifiedMark /> : null}
                    </p>
                    <p className="t-meta">{[offer.store.district, offer.store.city].filter(Boolean).join(", ")}</p>
                  </div>
                  <Price value={offer.amount_pen} size="card" />
                </div>
                {offer.note ? <p className="t-ui text-ink-2">“{offer.note}”</p> : null}
                {offer.status !== "sent" ? <Tag tone={offer.status === "accepted" ? "accent" : "neutral"} className="w-fit">{offerStatusLabel(offer.status)}</Tag> : null}
                {open && offer.status === "sent" ? (
                  choosing === offer.id ? (
                    <div className="grid gap-3 rounded-control bg-canvas p-3">
                      <p className="t-ui text-ink">
                        Al elegirla, {offer.store.name} verá tu nombre y tu WhatsApp, tú verás su dirección, y las demás ofertas se cierran.
                      </p>
                      <Field id={`telefono-${offer.id}`} label="Tu WhatsApp" error={phoneError}>
                        <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneError(""); }} />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => accept(offer.id)} loading={busy === "accept_trade_offer"} loadingLabel="Eligiendo">Elegir esta oferta</Button>
                        <Button variant="quiet" onClick={() => setChoosing(null)}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="secondary" className="w-fit" onClick={() => setChoosing(offer.id)}>Elegir esta oferta</Button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="tu-pedido" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
        <h2 id="tu-pedido" className="t-section text-ink">Lo que enviaste</h2>
        <p className="t-ui text-ink">
          {getConditionLabel(request.condition)} · {[request.city, request.region].filter(Boolean).join(", ")}
          {request.asking_price_pen ? ` · Esperas ${formatPrice(request.asking_price_pen)}` : ""}
        </p>
        <p className="whitespace-pre-line t-body text-ink">{request.description}</p>
        <TradePhotos photos={request.photos} title={request.title} />
      </section>

      {open || request.status === "accepted" ? (
        <Button variant="danger" className="w-fit" onClick={withdraw} loading={busy === "withdraw_trade_request"} loadingLabel="Retirando">
          Retirar pedido
        </Button>
      ) : null}
    </div>
  );
}
