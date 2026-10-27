"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Sheet } from "@/components/ui/sheet";
import { StatusTag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import {
  INSTALLMENT_CARDS,
  INSTALLMENT_CHOICES,
  formatInstallmentAmount,
  installmentLine,
  readInstallmentOffer,
} from "@/lib/payment-methods";
import { parseWholeSolPrice } from "@/lib/price";

export type OwnerInstallmentOffer = {
  max_installments: number;
  cards: string[];
  min_price_pen: number | null;
  owner_note: string | null;
  status: string;
  review_reason: string | null;
};

// store-floor, buy-09 "Cuotas" in Pagos, under the payment methods: a store that takes credit cards says it offers
// interest-free installments. Like a method, Laria reviews it before buyers see it and after every change. Buyers then
// see "o 12 cuotas sin intereses de S/ …" on the store's listings and can filter by "Acepta cuotas".

const STATUS_NOTES: Record<string, string> = {
  pending_review: "Laria las está revisando. Los compradores todavía no las ven.",
  approved: "Los compradores las ven en tu tienda y en tus publicaciones con unidades disponibles.",
  rejected: "Laria no las aprobó. Corrige los datos y envíalas otra vez.",
  disabled: "Laria las desactivó. Si cambias los datos, vuelven a revisión.",
};

// cardMethod: the store's card methods at their best: "approved", "pending" (only in review) or "none".
export function StoreInstallments({ offer, cardMethod, canEdit }: {
  offer: OwnerInstallmentOffer | null;
  cardMethod: "approved" | "pending" | "none";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirm, confirmDialog] = useConfirm();
  const messageRef = useRef<HTMLDivElement>(null);
  const current = offer && offer.status !== "withdrawn" ? offer : null;
  const parsed = current ? readInstallmentOffer(current) : null;

  function show(next: { tone: "success" | "danger"; text: string }) {
    setMessage(next);
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  async function withdraw() {
    const ok = await confirm({
      title: "¿Dejar de ofrecer cuotas?",
      body: "Tus publicaciones dejan de mostrarlas de inmediato. Si las ofreces otra vez, Laria las revisa de nuevo.",
      confirmLabel: "Dejar de ofrecerlas",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    const result = await saveInstallments({ action: "withdraw" });
    setBusy(false);
    show(result.ok ? { tone: "success", text: "Cuotas: ya no se muestran a los compradores." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  function closeSheet() {
    setEditing(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-editar-cuotas]")?.focus());
  }

  return (
    <section aria-labelledby="cuotas-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {confirmDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2 id="cuotas-titulo" className="t-section text-ink">Cuotas sin intereses</h2>
          <p className="max-w-[60ch] t-body text-ink-2">
            Si tu proveedor de tarjetas te permite cobrar en cuotas sin intereses, indícalo y tus publicaciones mostrarán cuánto
            sería cada cuota. Laria las revisa antes de mostrarlas.
          </p>
        </div>
        {canEdit && !current && cardMethod !== "none" ? (
          <Button data-editar-cuotas="" icon={<CreditCard aria-hidden />} onClick={() => { setMessage(null); setEditing(true); }}>
            Ofrecer cuotas
          </Button>
        ) : null}
      </div>

      {message ? (
        <div ref={messageRef} tabIndex={-1} className="outline-none" role={message.tone === "danger" ? "alert" : "status"}>
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}

      {current && parsed ? (
        <div className="grid gap-2 rounded-panel border border-subtle p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="t-body font-semibold text-ink">Hasta {parsed.maxInstallments} cuotas sin intereses</h3>
            <StatusTag domain="payment" status={current.status} />
          </div>
          <dl className="grid gap-1 t-ui text-ink-2 sm:grid-cols-[max-content_1fr] sm:gap-x-4">
            <dt className="font-semibold text-ink">Tarjetas</dt>
            <dd>{parsed.cards.length ? parsed.cards.join(", ") : "Cualquier tarjeta de crédito"}</dd>
            <dt className="font-semibold text-ink">Desde</dt>
            <dd>{parsed.minPricePen ? formatInstallmentAmount(parsed.minPricePen) : "Todas tus publicaciones"}</dd>
          </dl>
          <p className="t-meta">
            Ejemplo en una publicación de S/ 3,000: «{installmentLine(3000, parsed.maxInstallments)}».
          </p>
          {STATUS_NOTES[current.status] ? <p className="t-meta">{STATUS_NOTES[current.status]}</p> : null}
          {current.status === "approved" && cardMethod !== "approved" ? (
            <p className="t-ui font-semibold text-ink">Se mostrarán cuando Laria apruebe tu medio de pago con tarjeta.</p>
          ) : null}
          {current.review_reason && (current.status === "rejected" || current.status === "disabled") ? (
            <p className="t-ui font-semibold text-danger">Motivo: {current.review_reason}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canEdit && cardMethod !== "none" ? (
              <Button size="sm" variant="secondary" data-editar-cuotas="" disabled={busy}
                onClick={() => { setMessage(null); setEditing(true); }} aria-label="Editar cuotas sin intereses">
                Editar
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" loading={busy} loadingLabel="Guardando" onClick={() => void withdraw()}
              aria-label="Dejar de ofrecer cuotas sin intereses">
              Dejar de ofrecerlas
            </Button>
          </div>
        </div>
      ) : (
        <p className="t-body text-ink-2">
          {cardMethod === "none"
            ? "Para ofrecer cuotas, primero agrega un medio de pago con tarjeta: tarjeta con POS al recoger o enlace de pago."
            : "Todavía no ofreces cuotas."}
        </p>
      )}
      {current && cardMethod === "none" ? (
        <p className="t-meta">Tus cuotas no se muestran: agrega otra vez un medio de pago con tarjeta para que Laria lo revise.</p>
      ) : null}

      {editing ? (
        <InstallmentsSheet
          current={current}
          onClose={closeSheet}
          onSaved={(status) => {
            setEditing(false);
            show({ tone: "success", text: status === "approved"
              ? "Cuotas: no hubo cambios; siguen aprobadas."
              : "Cuotas: enviadas a revisión. Laria las revisa antes de mostrarlas." });
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

async function saveInstallments(body: Record<string, unknown>): Promise<{ ok: true; status: string | null } | { ok: false; message: string }> {
  try {
    const response = await fetch("/api/store/installments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: payload?.message ?? "No se pudo guardar. Intenta nuevamente." };
    return { ok: true, status: typeof payload.offer?.status === "string" ? payload.offer.status : null };
  } catch {
    return { ok: false, message: "No se pudo guardar. Revisa tu conexión e intenta nuevamente." };
  }
}

type Errors = { count?: string; minPrice?: string; interestFree?: string };

function InstallmentsSheet({ current, onClose, onSaved }: {
  current: OwnerInstallmentOffer | null;
  onClose: () => void;
  onSaved: (status: string | null) => void;
}) {
  const id = useId();
  const formId = `${id}-cuotas`;
  const [count, setCount] = useState(current ? String(current.max_installments) : "");
  const [minPrice, setMinPrice] = useState(current?.min_price_pen ? String(current.min_price_pen) : "");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const installments = Number(count) || null;
  const example = installmentLine(3000, installments);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const found: Errors = {};
    const floor = minPrice.trim() ? parseWholeSolPrice(minPrice) : null;
    if (!installments) found.count = "Elige hasta cuántas cuotas ofreces.";
    if (minPrice.trim() && !floor) found.minPrice = "Escribe el precio en soles, sin decimales.";
    if (data.get("interestFree") !== "on") found.interestFree = "Confírmalo para continuar: Laria solo muestra cuotas sin intereses.";
    setErrors(found);
    setFailure("");
    const first = found.count ? `${id}-numero` : found.minPrice ? `${id}-desde` : found.interestFree ? `${id}-sin-intereses` : null;
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setBusy(true);
    const result = await saveInstallments({
      action: "save",
      maxInstallments: installments,
      cards: data.getAll("cards").map(String),
      minPricePen: floor,
      note: (data.get("note") as string | null)?.trim() || undefined,
      interestFree: true,
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onSaved(result.status);
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
      <Button type="submit" form={formId} loading={busy} loadingLabel="Enviando…">Enviar a revisión</Button>
    </div>
  );

  return (
    <Sheet title={current ? "Editar cuotas sin intereses" : "Ofrecer cuotas sin intereses"} closeLabel="Cerrar sin guardar"
      onDismiss={() => { if (!busy) onClose(); }} layout="responsive" footer={footer}>
      <form id={formId} onSubmit={submit} className="grid gap-4 pt-4" noValidate>
        {current?.status === "approved" ? (
          <p className="t-body text-ink-2">Al guardar un cambio, vuelven a revisión de Laria y dejan de mostrarse hasta que las aprueben.</p>
        ) : null}
        <Field id={`${id}-numero`} label="Hasta cuántas cuotas" error={errors.count}
          hint={example ? `Así se verá en una publicación de S/ 3,000: «${example}».` : "Las que tu proveedor te permite ofrecer sin intereses."}>
          <Select name="count" value={count} onChange={(event) => setCount(event.target.value)}>
            <option value="">Elige</option>
            {INSTALLMENT_CHOICES.map((choice) => <option key={choice} value={choice}>{choice} cuotas</option>)}
          </Select>
        </Field>
        <fieldset className="grid min-w-0 gap-0.5">
          <legend className="t-ui font-semibold text-ink">Con qué tarjetas <span className="font-normal text-ink-2">(opcional)</span></legend>
          <p className="t-meta">Si no marcas ninguna, los compradores leen «con tarjeta de crédito».</p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {INSTALLMENT_CARDS.map((card) => (
              <Checkbox key={card} name="cards" value={card} defaultChecked={current?.cards.includes(card) ?? false} label={card} />
            ))}
          </div>
        </fieldset>
        <Field id={`${id}-desde`} label="Desde qué precio" optional error={errors.minPrice}
          hint={minPrice.trim() && parseWholeSolPrice(minPrice)
            ? `Solo las publicaciones de ${formatInstallmentAmount(parseWholeSolPrice(minPrice) ?? 0)} o más muestran las cuotas.`
            : "Déjalo vacío si las ofreces en todas tus publicaciones."}>
          <PriceInput name="minPrice" value={minPrice} onValueChange={setMinPrice} />
        </Field>
        <Field id={`${id}-nota`} label="Nota para Laria" hint="Por ejemplo, qué proveedor las procesa. Sin números de teléfono, cuenta o tarjeta, enlaces ni correos." optional>
          <Textarea name="note" maxLength={280} defaultValue={current?.owner_note ?? ""} className="min-h-20" />
        </Field>
        <div className="grid gap-1">
          <Checkbox id={`${id}-sin-intereses`} name="interestFree"
            aria-describedby={errors.interestFree ? `${id}-sin-intereses-error` : undefined}
            aria-invalid={errors.interestFree ? true : undefined}
            label="Confirmo que el comprador no paga intereses ni recargos por pagar en cuotas"
            description="Si tu proveedor cobra intereses al comprador, no las ofrezcas aquí: Laria no muestra cuotas con intereses." />
          {errors.interestFree ? <p id={`${id}-sin-intereses-error`} className="t-ui font-semibold text-danger">{errors.interestFree}</p> : null}
        </div>
        {failure ? <Notice tone="danger" role="alert">{failure}</Notice> : null}
      </form>
    </Sheet>
  );
}
