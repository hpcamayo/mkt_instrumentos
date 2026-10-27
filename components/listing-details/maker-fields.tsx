"use client";

import { Checkbox, Field, Input } from "@/components/ui/field";
import { ARTIST_DISCLAIMER, MAKER_DISCLAIMER } from "@/lib/discovery/makers";
import { detailFieldId } from "@/lib/listing-details";
import { ARTIST_NOTE_MAX, MADE_TO_ORDER_MAX, MADE_TO_ORDER_MIN, MAKER_KEY, type MakerAccess, type MakerForm } from "@/lib/maker-details";

// Discovery's maker marks (disc-04, disc-05) in the sell form, saved with the listing (lib/maker-details.ts). Same
// copy as discovery's own form on the edit page (components/discovery/listing-maker-form.tsx). Shown only to a seller
// who may use them.
export function MakerFields({ idPrefix, access, value, onChange, error, heading: Heading = "h3" }: {
  idPrefix: string;
  access: MakerAccess;
  value: MakerForm;
  onChange: (value: MakerForm) => void;
  error?: { field?: string; message: string };
  heading?: "h2" | "h3";
}) {
  if (!access.handmade && !access.artistNote) return null;
  const id = (field: string) => detailFieldId(idPrefix, MAKER_KEY, field);
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);
  const set = <K extends keyof MakerForm>(key: K, next: MakerForm[K]) => onChange({ ...value, [key]: next });
  return (
    <section aria-labelledby={id("titulo")} className="grid min-w-0 gap-3 border-t border-subtle pt-5">
      <Heading id={id("titulo")} className={Heading === "h2" ? "t-section text-ink" : "t-ui font-semibold text-ink"}>
        {access.handmade ? "Hecho en Perú" : "Equipo de artista"} <span className="font-normal text-ink-2">(opcional)</span>
      </Heading>
      {access.handmade ? (
        <div className="grid gap-1">
          <Checkbox id={id("handmade")} name={`${idPrefix}-handmade`} checked={value.handmade} onChange={(event) => set("handmade", event.target.checked)} label="Lo hizo mi taller" description="Muestra «Hecho a mano en …» con la ciudad de tu taller." />
          <Checkbox id={id("to_order")} name={`${idPrefix}-to_order`} checked={value.to_order} onChange={(event) => set("to_order", event.target.checked)} label="Se hace a pedido" description="Para instrumentos que haces después de que te lo piden. Sigue siendo un instrumento concreto, con su precio." />
          {value.to_order ? (
            <Field id={id("weeks")} label="Semanas para tenerlo listo" hint={`Entre ${MADE_TO_ORDER_MIN} y ${MADE_TO_ORDER_MAX}.`} error={errorFor("weeks")} className="mt-1">
              <Input name={`${idPrefix}-weeks`} type="text" inputMode="numeric" maxLength={2} value={value.weeks} onChange={(event) => set("weeks", event.target.value.replace(/\D/g, ""))} className="max-w-32" />
            </Field>
          ) : null}
          <p className="t-meta">{MAKER_DISCLAIMER}</p>
        </div>
      ) : null}
      {access.artistNote ? (
        <div className="grid gap-2">
          <Field id={id("artist_note")} label="Cómo usaste este equipo" optional error={errorFor("artist_note")} hint="Por ejemplo: «Usado en la gira 2024». Hasta 140 caracteres.">
            <Input name={`${idPrefix}-artist_note`} maxLength={ARTIST_NOTE_MAX} value={value.artist_note} onChange={(event) => set("artist_note", event.target.value)} />
          </Field>
          <p className="t-meta">{ARTIST_DISCLAIMER}</p>
        </div>
      ) : null}
    </section>
  );
}
