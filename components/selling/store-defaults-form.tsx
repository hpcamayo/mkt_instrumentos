"use client";

import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageNotice } from "@/components/page-notice";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { conditionOptions } from "@/lib/listings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

// SHOP 06: what a store repeats in every listing, set once. The sell form starts with this condition chosen and this
// text at the end of the description; the seller can still change both in each listing.
export const STORE_FOOTER_MAX = 1000;

export function StoreDefaultsForm({ storeId, initial }: { storeId: string; initial: { condition: string | null; descriptionFooter: string } }) {
  const [condition, setCondition] = useState(initial.condition ?? "");
  const [footer, setFooter] = useState(initial.descriptionFooter);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setMessage({ kind: "error", text: "No pudimos conectar. Intenta nuevamente." });
    setSaving(true);
    setMessage(null);
    // store_listing_defaults is newer than the generated database types.
    const { error } = await (supabase as unknown as SupabaseClient).from("store_listing_defaults").upsert({
      store_id: storeId,
      condition: condition || null,
      description_footer: footer.trim(),
    });
    setSaving(false);
    setMessage(error
      ? { kind: "error", text: "No pudimos guardar los valores. Intenta nuevamente." }
      : { kind: "success", text: "Guardado. Se usarán en tus próximas publicaciones." });
  }

  return (
    <form onSubmit={save} className="grid gap-5 rounded-panel border border-subtle bg-white p-5 sm:p-6">
      {message ? <PageNotice kind={message.kind} message={message.text} /> : null}
      <Field id="valores-condicion" label="Condición más habitual" hint="Se elige sola en cada publicación nueva. Déjala vacía si varía.">
        <Select name="condition" value={condition} onChange={(event) => setCondition(event.target.value)} className="sm:max-w-xs">
          <option value="">Sin condición por defecto</option>
          {conditionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
      </Field>
      <Field id="valores-texto" label="Texto al final de cada descripción" hint="Garantía de la tienda, horario para ver el equipo, formas de entrega. No incluyas teléfonos ni enlaces: las consultas llegan por el botón de WhatsApp.">
        <Textarea name="description_footer" rows={5} maxLength={STORE_FOOTER_MAX} value={footer} onChange={(event) => setFooter(event.target.value)} />
      </Field>
      <Button type="submit" loading={saving} loadingLabel="Guardando…" className="w-fit">Guardar valores</Button>
    </form>
  );
}
