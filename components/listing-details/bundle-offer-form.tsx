"use client";

import { type FormEvent, useState } from "react";
import { postDiscovery } from "@/components/discovery/post-json";
import { TypeChips } from "@/components/selling/choice-fields";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { bundleOfferText, type BundleOffer } from "@/lib/combo";

// buy-01: "Si me llevas 2 o más, te descuento 10%". Shown on the seller's listings beside "Pedir el combo" and in the
// combo's WhatsApp message. Off until the seller chooses a discount; nothing is chosen for them.
const DISCOUNTS = [5, 10, 15, 20, 25, 30];

export function BundleOfferForm({ initial, isStore }: { initial: BundleOffer | null; isStore: boolean }) {
  const [discount, setDiscount] = useState(initial ? String(initial.discount_percent) : "none");
  const [minItems, setMinItems] = useState(String(initial?.min_items ?? 2));
  const [saved, setSaved] = useState<BundleOffer | null>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const offer = discount === "none" ? null : { discount_percent: Number(discount), min_items: Number(minItems) };
    const result = await postDiscovery("/api/listing-details/bundle-offer", { discountPercent: offer?.discount_percent ?? null, minItems: offer?.min_items ?? 2 });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.message });
      return;
    }
    setSaved(offer);
    setMessage({ tone: "success", text: offer ? `Guardado: ${bundleOfferText(offer)}.` : "Guardado: sin descuento por combo." });
  }

  return (
    <form onSubmit={save} aria-labelledby="combo-descuento" className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5">
      <div>
        <h2 id="combo-descuento" className="t-section text-ink">Descuento por combo</h2>
        <p className="mt-1 max-w-[68ch] t-ui text-ink-2">
          Quien junta varias de {isStore ? "las publicaciones de tu tienda" : "tus publicaciones"} con «Pedir el combo» ve este descuento, y va en
          su mensaje de WhatsApp. Es tu oferta: el precio final lo acuerdan ustedes.
        </p>
        <p className="mt-2 t-meta font-semibold text-ink">{saved ? `Ahora: ${bundleOfferText(saved)}.` : "Ahora: sin descuento por combo."}</p>
      </div>
      <TypeChips
        id="combo-descuento-valor"
        name="combo_discount"
        legend="Descuento"
        options={[{ value: "none", label: "Sin descuento" }, ...DISCOUNTS.map((value) => ({ value: String(value), label: `${value}%` }))]}
        value={discount}
        onChange={setDiscount}
      />
      {discount !== "none" ? (
        <div className="max-w-56">
          <Field id="combo-minimo" label="Desde cuántas publicaciones">
            <Select name="combo_min_items" value={minItems} onChange={(event) => setMinItems(event.target.value)}>
              {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} o más</option>)}
            </Select>
          </Field>
        </div>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div><Button type="submit" variant="secondary" loading={busy} loadingLabel="Guardando…">Guardar descuento</Button></div>
    </form>
  );
}
