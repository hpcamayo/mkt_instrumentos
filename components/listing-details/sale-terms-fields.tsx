"use client";

import { RotateCcw } from "lucide-react";
import { TypeChips } from "@/components/selling/choice-fields";
import { Chip } from "@/components/ui/chip";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { detailFieldId } from "@/lib/listing-details";
import { categoryOptions } from "@/lib/listings";
import {
  CARRIERS,
  CARRIER_LABELS,
  LIMA_DELIVERY,
  LIMA_DELIVERY_CHOICES,
  PICKUP_AREA_MAX,
  PRICE_MODE_LABELS,
  SHIPPING_PAYMENT,
  SHIPPING_PAYMENT_CHOICES,
  TRADE_CATEGORIES,
  TRADE_WANTS_MAX,
  deliveryTermsOnly,
  hasSaleTerms,
  type SaleTerms,
} from "@/lib/sale-terms";

// listing-details (docs/feature-ideas/listing-details.md): the seller's sale terms in the sell and edit forms.
// Nothing is chosen until the seller chooses it (no pre-ticked option), every part is optional, and each choice
// that needs a follow-up shows it only once it is on. Laria never handles the parcel, the money or the trade:
// the copy says so where it matters.

export const SALE_TERMS_KEY = "sale_terms";

type FieldError = { field?: string; message: string };

// sell-07: next to the price. Two radio chips, neither chosen at first, and a way back to "not said".
export function PriceModeField({ idPrefix, value, onChange }: { idPrefix: string; value: SaleTerms["price_mode"]; onChange: (value: SaleTerms["price_mode"]) => void }) {
  return (
    <div className="grid gap-1.5">
      <TypeChips
        id={detailFieldId(idPrefix, SALE_TERMS_KEY, "price_mode")}
        name={`${idPrefix}-price_mode`}
        legend="¿Precio fijo o conversable? (opcional)"
        options={[
          { value: "fixed", label: PRICE_MODE_LABELS.fixed },
          { value: "negotiable", label: PRICE_MODE_LABELS.negotiable },
        ]}
        value={value ?? ""}
        onChange={(next) => onChange(next === "fixed" || next === "negotiable" ? next : null)}
      />
      <div className="flex flex-wrap items-center gap-x-3">
        <p className="t-meta">Se muestra junto al precio. Así el comprador sabe si puede proponerte otro.</p>
        {value ? <ClearButton onClick={() => onChange(null)}>No indicarlo</ClearButton> : null}
      </div>
    </div>
  );
}

// buy-02 and sell-06: how it is delivered and what trades the seller takes. `previous` is what the seller used
// last time on this device; offered with a button, never filled in on its own.
export function SaleTermsFields({
  idPrefix,
  value,
  onChange,
  error,
  previous,
  heading: Heading = "h3",
}: {
  idPrefix: string;
  value: SaleTerms;
  onChange: (value: SaleTerms) => void;
  error?: FieldError;
  previous?: SaleTerms | null;
  heading?: "h2" | "h3";
}) {
  const id = (field: string) => detailFieldId(idPrefix, SALE_TERMS_KEY, field);
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);
  const set = <K extends keyof SaleTerms>(key: K, next: SaleTerms[K]) => onChange({ ...value, [key]: next });
  const delivery = deliveryTermsOnly(value);
  const offerPrevious = previous && hasSaleTerms(deliveryTermsOnly(previous)) && !hasSaleTerms(delivery) ? previous : null;
  const categoryLabel = (category: string) => categoryOptions.find((option) => option.value === category)?.label ?? category;

  return (
    <section aria-labelledby={id("titulo")} className="grid min-w-0 gap-4 border-t border-subtle pt-5">
      <div>
        <Heading id={id("titulo")} className={Heading === "h2" ? "t-section text-ink" : "t-ui font-semibold text-ink"}>
          Entrega y cambios <span className="font-normal text-ink-2">(opcional)</span>
        </Heading>
        <p className="mt-1 t-meta">Responde de antemano lo que más preguntan. Laria no gestiona envíos, pagos ni cambios: se acuerdan entre ustedes.</p>
      </div>
      {offerPrevious ? (
        <button type="button" onClick={() => onChange({ ...offerPrevious, price_mode: value.price_mode })} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 t-ui font-semibold text-ink hover:bg-canvas">
          <RotateCcw className="h-4 w-4" aria-hidden />Usar lo de tu última publicación
        </button>
      ) : null}

      <fieldset className="grid min-w-0 gap-1">
        <legend className="t-ui font-semibold text-ink">En persona</legend>
        <Checkbox id={id("pickup")} name={`${idPrefix}-pickup`} checked={value.pickup} onChange={(event) => set("pickup", event.target.checked)} label="Recojo en persona" description="El comprador lo recoge donde acuerden." />
        <Checkbox id={id("can_try")} name={`${idPrefix}-can_try`} checked={value.can_try} onChange={(event) => set("can_try", event.target.checked)} label="Se puede probar antes de comprar" description="Aparece en el filtro «Se puede probar»." />
        {value.pickup || value.can_try ? (
          <Field id={id("pickup_area")} label="Distrito o zona" optional error={errorFor("pickup_area")} hint="Solo el distrito o la zona, nunca tu dirección. Ej.: Miraflores, cerca al óvalo Gutiérrez." className="mt-2 sm:max-w-md">
            <Input type="text" name={`${idPrefix}-pickup_area`} maxLength={PICKUP_AREA_MAX} autoComplete="off" value={value.pickup_area} onChange={(event) => set("pickup_area", event.target.value)} />
          </Field>
        ) : null}
      </fieldset>

      <div className="grid gap-1.5">
        <TypeChips
          id={id("lima_delivery")}
          name={`${idPrefix}-lima_delivery`}
          legend="Delivery en Lima: ¿quién lo paga?"
          options={LIMA_DELIVERY.map((option) => ({ value: option, label: LIMA_DELIVERY_CHOICES[option] }))}
          value={value.lima_delivery ?? ""}
          onChange={(next) => set("lima_delivery", LIMA_DELIVERY.find((option) => option === next) ?? null)}
        />
        <div className="flex flex-wrap items-center gap-x-3">
          <p className="t-meta">Déjalo sin marcar si no haces delivery.</p>
          {value.lima_delivery ? <ClearButton onClick={() => set("lima_delivery", null)}>No hago delivery</ClearButton> : null}
        </div>
      </div>

      <fieldset className="grid min-w-0 gap-1">
        <legend className="t-ui font-semibold text-ink">Provincias</legend>
        <Checkbox id={id("ships_provinces")} name={`${idPrefix}-ships_provinces`} checked={value.ships_provinces} onChange={(event) => set("ships_provinces", event.target.checked)} label="Envío a provincia por agencia" description="Aparece en el filtro «Envía a provincia»." />
        {value.ships_provinces ? (
          <div className="grid gap-4 border-l-2 border-subtle pl-4">
            <fieldset className="grid min-w-0 gap-1">
              <legend className="t-ui font-semibold text-ink">Agencias <span className="font-normal text-ink-2">(opcional)</span></legend>
              <div className="flex flex-wrap gap-x-5">
                {CARRIERS.map((carrier, index) => (
                  <Checkbox
                    key={carrier}
                    id={index === 0 ? id("carriers") : undefined}
                    name={`${idPrefix}-carriers`}
                    value={carrier}
                    checked={value.carriers.includes(carrier)}
                    onChange={(event) => set("carriers", CARRIERS.filter((item) => (item === carrier ? event.target.checked : value.carriers.includes(item))))}
                    label={CARRIER_LABELS[carrier]}
                  />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-1.5">
              <TypeChips
                id={id("shipping_payment")}
                name={`${idPrefix}-shipping_payment`}
                legend="¿Cuándo se paga el envío? (opcional)"
                options={SHIPPING_PAYMENT.map((option) => ({ value: option, label: SHIPPING_PAYMENT_CHOICES[option] }))}
                value={value.shipping_payment ?? ""}
                onChange={(next) => set("shipping_payment", SHIPPING_PAYMENT.find((option) => option === next) ?? null)}
              />
              {value.shipping_payment ? <ClearButton onClick={() => set("shipping_payment", null)}>No indicarlo</ClearButton> : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid min-w-0 gap-1">
        <legend className="t-ui font-semibold text-ink">Cambios</legend>
        <Checkbox id={id("accepts_trades")} name={`${idPrefix}-accepts_trades`} checked={value.accepts_trades} onChange={(event) => set("accepts_trades", event.target.checked)} label="Acepto cambios" description="Aparece en el filtro «Acepta cambios». Puedes aceptar o no cada propuesta." />
        {value.accepts_trades ? (
          <div className="grid gap-4 border-l-2 border-subtle pl-4">
            <Field id={id("trade_wants")} label="Acepto cambios por…" optional error={errorFor("trade_wants")} hint="Ej.: un pedal de delay o un amplificador pequeño. Sin teléfonos ni enlaces.">
              <Textarea name={`${idPrefix}-trade_wants`} rows={2} maxLength={TRADE_WANTS_MAX} value={value.trade_wants} onChange={(event) => set("trade_wants", event.target.value)} />
            </Field>
            <div className="grid gap-2" role="group" aria-labelledby={id("trade_categories")}>
              <p id={id("trade_categories")} className="t-ui font-semibold text-ink">Categorías que te interesan <span className="font-normal text-ink-2">(opcional)</span></p>
              <div className="flex flex-wrap gap-2">
                {TRADE_CATEGORIES.map((category) => {
                  const selected = value.trade_categories.includes(category);
                  return (
                    <Chip key={category} selected={selected} onClick={() => set("trade_categories", TRADE_CATEGORIES.filter((item) => (item === category ? !selected : value.trade_categories.includes(item))))}>
                      {categoryLabel(category)}
                    </Chip>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </fieldset>
    </section>
  );
}

function ClearButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className="link inline-flex min-h-11 items-center t-ui font-semibold">
      {children}
    </button>
  );
}
