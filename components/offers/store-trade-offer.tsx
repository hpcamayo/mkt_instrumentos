"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button, buttonClasses } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { buildWhatsAppHref } from "@/lib/phone";
import { formatPrice, parseWholeSolPrice } from "@/lib/price";
import { formatCalendarDate, formatLimaDateTime, type StoreTradeRequest } from "@/lib/selling-tools";

// The store's side of one request: send or change its one offer while the window is open; after the person chooses
// it, their WhatsApp and the drop-off date; after the visit, record whether it happened.
export function StoreTradeOffer({ request, storeName }: { request: StoreTradeRequest; storeName: string }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [amount, setAmount] = useState(request.my_offer ? String(request.my_offer.amount_pen) : "");
  const [note, setNote] = useState(request.my_offer?.note ?? "");
  const [amountError, setAmountError] = useState("");
  const [completed, setCompleted] = useState(true);
  const [finalPrice, setFinalPrice] = useState(request.my_offer ? String(request.my_offer.amount_pen) : "");
  const [reason, setReason] = useState("");
  const sell = request.kind === "sell";
  const canOffer = request.status === "open" && Date.parse(request.offers_until) > Date.now()
    && (!request.my_offer || request.my_offer.status === "sent" || request.my_offer.status === "withdrawn");
  const chosen = request.my_offer?.status === "accepted";

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = parseWholeSolPrice(amount);
    if (!value) return setAmountError("Escribe un monto en soles.");
    setAmountError("");
    if (await run("save_trade_offer", { p_request_id: request.id, p_amount_pen: value, p_note: note.trim() || null }, "No pudimos enviar la oferta. Inténtalo de nuevo.")) router.refresh();
  }

  async function withdraw() {
    if (request.my_offer && await run("withdraw_trade_offer", { p_offer_id: request.my_offer.id }, "No pudimos retirar la oferta. Inténtalo de nuevo.")) router.refresh();
  }

  async function close(event: FormEvent) {
    event.preventDefault();
    const value = completed ? parseWholeSolPrice(finalPrice) : null;
    if (completed && !value) return setAmountError("Escribe el precio final en soles.");
    setAmountError("");
    if (await run("close_trade_request", { p_request_id: request.id, p_completed: completed, p_final_price_pen: value, p_reason: reason.trim() || null },
      "No pudimos guardar el resultado. Inténtalo de nuevo.")) router.refresh();
  }

  return (
    <div className="grid gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {chosen && request.status === "accepted" && request.contact ? (
        <section aria-labelledby="te-eligieron" className="grid gap-3 rounded-panel border border-line-strong bg-surface p-5">
          <h2 id="te-eligieron" className="t-section text-ink">Eligieron tu {sell ? "oferta" : "estimado"}</h2>
          <p className="t-body text-ink">
            {request.contact.name} llevará el equipo hasta el <strong>{request.drop_off_by ? formatCalendarDate(request.drop_off_by) : "plazo acordado"}</strong>.
            Revísalo, confirma el {sell ? "precio" : "valor"} final y {sell ? "paga directamente" : "descuéntalo de la compra"}; Laria no interviene en el pago.
          </p>
          {request.contact.whatsapp_phone ? (
            <a
              href={buildWhatsAppHref(request.contact.whatsapp_phone, `Hola ${request.contact.name}, somos ${storeName}. Recibimos tu elección en Laria por tu ${request.title}. ¿Cuándo puedes traerlo?`)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "primary", className: "w-fit" })}
            >
              <WhatsAppGlyph />
              Contactar por WhatsApp
            </a>
          ) : null}
          <form onSubmit={close} className="grid gap-3 border-t border-subtle pt-3">
            <p className="t-ui font-semibold text-ink">Después de la visita</p>
            <Checkbox checked={completed} onChange={(event) => setCompleted(event.target.checked)} label={sell ? "Lo compramos" : "Lo recibimos como parte de pago"} />
            {completed ? (
              <Field id="precio-final" label={sell ? "Precio final pagado" : "Valor final reconocido"} error={amountError}>
                <PriceInput value={finalPrice} onValueChange={setFinalPrice} />
              </Field>
            ) : (
              <Field id="motivo" label="¿Qué pasó?" optional>
                <Textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
              </Field>
            )}
            <Button type="submit" variant="secondary" className="w-fit" loading={busy === "close_trade_request"} loadingLabel="Guardando">Guardar resultado</Button>
          </form>
        </section>
      ) : null}

      {canOffer ? (
        <form onSubmit={send} className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
          <h2 className="t-section text-ink">{request.my_offer?.status === "sent" ? "Tu oferta" : sell ? "Enviar una oferta" : "Enviar un estimado"}</h2>
          <p className="t-ui text-ink-2">
            Una por tienda, hasta el {formatLimaDateTime(request.offers_until)}. Es un {sell ? "precio" : "valor"} sujeto a revisar el equipo en tu tienda.
          </p>
          <Field id="oferta-monto" label={sell ? "Ofreces" : "Estimado"} error={amountError}>
            <PriceInput value={amount} onValueChange={setAmount} />
          </Field>
          <Field id="oferta-nota" label="Nota" optional hint="Cómo pagas o qué revisarás. Sin teléfonos ni enlaces.">
            <Textarea value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy === "save_trade_offer"} loadingLabel="Enviando">
              {request.my_offer?.status === "sent" ? "Cambiar oferta" : sell ? "Enviar oferta" : "Enviar estimado"}
            </Button>
            {request.my_offer?.status === "sent" ? (
              <Button variant="quiet" onClick={withdraw} loading={busy === "withdraw_trade_offer"} loadingLabel="Retirando">Retirar oferta</Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {!canOffer && !chosen && request.my_offer ? (
        <Notice tone="info">
          {request.my_offer.status === "declined" ? "La persona eligió otra oferta o retiró su pedido." : `Tu oferta: ${formatPrice(request.my_offer.amount_pen)}.`}
        </Notice>
      ) : null}
      {request.status === "completed" && chosen ? <Notice tone="success">Registraste que se concretó{request.final_price_pen ? ` por ${formatPrice(request.final_price_pen)}` : ""}.</Notice> : null}
    </div>
  );
}
