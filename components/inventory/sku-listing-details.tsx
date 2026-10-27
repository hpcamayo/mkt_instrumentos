"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PageNotice } from "@/components/page-notice";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { getInstrumentTypeOptions } from "@/lib/listing-submission";
import { conditionOptions } from "@/lib/listings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import type { Json } from "@/lib/supabase/database.types";

// STOCK 09 (Effortless Laria, selling batch): what a SKU remembers for its next publication. Publishing the SKU, or an
// import that carries these columns, fills it in; the store can correct it here; "Publicar este SKU" starts with it.
// The SKU page shows it above "Publicar este SKU" while the SKU has no publication. Saved with
// update_inventory_listing_details, which checks the store's write access and locks the SKU like every other inventory
// change. The category is the SKU's own, edited once in "Categoría del SKU" (stock-20) on the same page; here it only
// decides the instrument types offered.

export type SkuListingDetails = { brand?: string; model?: string; instrument_type?: string; condition?: string; description?: string; attributes?: { [key: string]: Json | undefined } };

export function SkuListingDetailsPanel({ itemId, category, details, canWrite }: {
  itemId: string;
  category: string | null;
  details: SkuListingDetails | null | undefined;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    instrument_type: details?.instrument_type ?? "",
    brand: details?.brand ?? "",
    model: details?.model ?? "",
    condition: details?.condition ?? "",
    description: details?.description ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const types = getInstrumentTypeOptions(category ?? "");
  // A type left over from another category is not offered, and not saved.
  const instrumentType = types.some((option) => option.value === values.instrument_type) ? values.instrument_type : "";
  const filled = [values.brand, values.model, values.condition, values.description].filter((value) => value.trim()).length;
  const set = (key: keyof typeof values, value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setMessage({ kind: "error", text: "No pudimos conectar. Intenta nuevamente." });
    setSaving(true);
    setMessage(null);
    const payload: { [key: string]: Json | undefined } = Object.fromEntries(Object.entries({ ...values, instrument_type: instrumentType }).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
    if (details?.attributes && instrumentType === (details.instrument_type ?? "")) payload.attributes = details.attributes;
    const { error } = await supabase.rpc("update_inventory_listing_details", { p_item_id: itemId, p_details: payload });
    setSaving(false);
    if (error) return setMessage({ kind: "error", text: error.message.includes("NOT_OWNED") ? "No puedes administrar este inventario." : "No pudimos guardar los datos. Intenta nuevamente." });
    setMessage({ kind: "success", text: "Guardado. Se usarán la próxima vez que publiques este SKU." });
    router.refresh();
  }

  return (
    <details className="group rounded-panel border border-subtle bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-4 t-ui font-semibold text-ink">
        <span>Datos para publicar</span>
        <span className="t-meta font-normal">{filled ? `${filled} de 4 completados` : "Sin completar"}</span>
      </summary>
      <form onSubmit={save} className="grid gap-4 border-t border-subtle p-4">
        <p className="t-meta">Se completan al publicar este SKU o al importarlo, y aparecen ya escritos la próxima vez que lo publiques.</p>
        {message ? <PageNotice kind={message.kind} message={message.text} /> : null}
        <fieldset disabled={!canWrite || saving} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {types.length > 1 ? (
              <Field id={`sku-${itemId}-type`} label="Tipo de instrumento">
                <Select value={instrumentType} onChange={(event) => set("instrument_type", event.target.value)}>
                  <option value="">Selecciona una opción</option>
                  {types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
            ) : null}
            <Field id={`sku-${itemId}-brand`} label="Marca">
              <Input value={values.brand} maxLength={80} onChange={(event) => set("brand", event.target.value)} />
            </Field>
            <Field id={`sku-${itemId}-model`} label="Modelo">
              <Input value={values.model} maxLength={80} onChange={(event) => set("model", event.target.value)} />
            </Field>
            <Field id={`sku-${itemId}-condition`} label="Condición">
              <Select value={values.condition} onChange={(event) => set("condition", event.target.value)}>
                <option value="">Sin condición</option>
                {conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            </Field>
          </div>
          <Field id={`sku-${itemId}-description`} label="Descripción">
            <Textarea rows={4} maxLength={10000} value={values.description} onChange={(event) => set("description", event.target.value)} />
          </Field>
          {canWrite ? <Button type="submit" variant="secondary" loading={saving} loadingLabel="Guardando…" className="w-fit">Guardar datos</Button> : null}
        </fieldset>
      </form>
    </details>
  );
}
