"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { Checkbox, Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { categoryOptions } from "@/lib/listings";
import { CONSUMABLE_OPTIONS, TRADE_CATEGORIES, type StoreTradeSettings } from "@/lib/selling-tools";

// The store's opt-ins: "Compramos usados" by category (sell-02), consignment (sell-03), part payment by default on
// its listings (run-04) and the consumables it stocks (buy-06). All off until the store turns them on.
export function StoreTradeSettingsForm({ settings, verified }: { settings: Omit<StoreTradeSettings, "store_id">; verified: boolean }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [values, setValues] = useState(settings);
  const [saved, setSaved] = useState(false);
  const categories = categoryOptions.filter((option) => (TRADE_CATEGORIES as readonly string[]).includes(option.value));

  function toggle(list: "buy_categories" | "consumables", value: string, on: boolean) {
    setValues((current) => ({ ...current, [list]: on ? [...current[list], value] : current[list].filter((entry) => entry !== value) }));
    setSaved(false);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await run("set_store_trade_settings", { p_fields: values }, "No pudimos guardar los cambios. Inténtalo de nuevo.");
    if (result) {
      setSaved(true);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {saved ? <Notice tone="success">Cambios guardados.</Notice> : null}
      {verified ? null : (
        <Notice tone="info">Comprar usados y recibir en consignación es para tiendas verificadas. Parte de pago e insumos están disponibles para tu tienda.</Notice>
      )}

      <fieldset className="grid gap-2 rounded-panel border border-subtle bg-surface p-5" disabled={!verified}>
        <legend className="px-1 t-section text-ink">Compramos usados</legend>
        <p className="t-ui text-ink-2">Recibe pedidos de particulares de tu región que quieren vender ya. Tienes 24 horas para ofertar; si te eligen, la persona lleva el equipo a tu tienda en 5 días y tú confirmas el precio al revisarlo.</p>
        <Checkbox checked={values.buys_used} onChange={(event) => { setValues({ ...values, buys_used: event.target.checked }); setSaved(false); }} label="Quiero recibir pedidos de compra" />
        {values.buys_used ? (
          <div className="grid gap-1 pl-7">
            <p className="t-ui font-semibold text-ink">Categorías que compras</p>
            {categories.map((option) => (
              <Checkbox key={option.value} checked={values.buy_categories.includes(option.value)} onChange={(event) => toggle("buy_categories", option.value, event.target.checked)} label={option.label} />
            ))}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2 rounded-panel border border-subtle bg-surface p-5" disabled={!verified}>
        <legend className="px-1 t-section text-ink">Consignación</legend>
        <p className="t-ui text-ink-2">Publica equipos de particulares como publicaciones de tu tienda (cuentan en tu límite) y vincula a la persona dueña para que vea cómo van. La comisión la acuerdan ustedes.</p>
        <Checkbox checked={values.consignment} onChange={(event) => { setValues({ ...values, consignment: event.target.checked }); setSaved(false); }} label="Recibimos en consignación" />
      </fieldset>

      <fieldset className="grid gap-2 rounded-panel border border-subtle bg-surface p-5">
        <legend className="px-1 t-section text-ink">Parte de pago</legend>
        <p className="t-ui text-ink-2">Tus publicaciones dirán «Aceptamos tu equipo como parte de pago» y el comprador te enviará fotos de lo que dejaría. Puedes cambiarlo en cada publicación.</p>
        <Checkbox checked={values.part_payment} onChange={(event) => { setValues({ ...values, part_payment: event.target.checked }); setSaved(false); }} label="Aceptamos equipos como parte de pago" />
      </fieldset>

      <fieldset className="grid gap-2 rounded-panel border border-subtle bg-surface p-5">
        <legend className="px-1 t-section text-ink">Insumos que vendes</legend>
        <p className="t-ui text-ink-2">Cuando a alguien de tu región le toca cambiar cuerdas, cañas o parches, su recordatorio puede nombrar tu tienda. Sin costo y sin anuncios pagados.</p>
        {CONSUMABLE_OPTIONS.map((option) => (
          <Checkbox key={option.value} checked={values.consumables.includes(option.value)} onChange={(event) => toggle("consumables", option.value, event.target.checked)} label={option.label} />
        ))}
      </fieldset>

      <Field id="ajustes-nota" label="Nota para quien vende" optional hint="Qué revisas, cómo pagas. Sin teléfonos ni enlaces.">
        <Textarea value={values.note ?? ""} maxLength={300} onChange={(event) => { setValues({ ...values, note: event.target.value }); setSaved(false); }} />
      </Field>

      <Button type="submit" className="w-fit" loading={busy === "set_store_trade_settings"} loadingLabel="Guardando">Guardar</Button>
    </form>
  );
}
