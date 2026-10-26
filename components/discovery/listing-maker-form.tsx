"use client";

import { type FormEvent, useState } from "react";
import { postDiscovery } from "@/components/discovery/post-json";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { ARTIST_DISCLAIMER, MAKER_DISCLAIMER } from "@/lib/discovery/makers";

export type ListingMakerFormState = {
  can_mark_handmade: boolean;
  can_add_artist_note: boolean;
  handmade: boolean;
  made_to_order_weeks: number | null;
  artist_note: string | null;
};

// The marks are saved on their own, right away (they are not part of the listing's moderated content): the store's
// or the artist's own declaration, shown with whose word it is.
export function ListingMakerForm({ listingId, initial }: { listingId: string; initial: ListingMakerFormState }) {
  const [handmade, setHandmade] = useState(initial.handmade);
  const [toOrder, setToOrder] = useState(initial.made_to_order_weeks !== null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const weeks = String(form.get("weeks") ?? "").trim();
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/discovery/listing", {
      listingId,
      handmade: initial.can_mark_handmade && handmade,
      madeToOrderWeeks: initial.can_mark_handmade && toOrder && weeks ? Number(weeks) : null,
      artistNote: initial.can_add_artist_note ? String(form.get("artist_note") ?? "").trim() || null : initial.artist_note,
    });
    setBusy(false);
    setMessage(result.ok ? { tone: "success", text: "Guardado. Se ve en la publicación." } : { tone: "danger", text: result.message });
  }

  return (
    <form onSubmit={save} aria-labelledby="marcas-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5">
      <h2 id="marcas-titulo" className="t-section text-ink">Hecho en Perú y equipo de artista</h2>
      {initial.can_mark_handmade ? (
        <div className="grid gap-2">
          <Checkbox name="handmade" checked={handmade} onChange={(event) => setHandmade(event.target.checked)} label="Lo hizo mi taller" description="Muestra «Hecho a mano en …» con la ciudad de tu taller." />
          <Checkbox name="to_order" checked={toOrder} onChange={(event) => setToOrder(event.target.checked)} label="Se hace a pedido" description="Para instrumentos que haces después de que te lo piden. Sigue siendo un instrumento concreto, con su precio." />
          {toOrder ? (
            <Field id="pedido-semanas" label="Semanas para tenerlo listo" hint="Entre 1 y 26.">
              <Input name="weeks" type="number" min={1} max={26} required defaultValue={initial.made_to_order_weeks ?? ""} className="max-w-32" />
            </Field>
          ) : null}
          <p className="t-meta">{MAKER_DISCLAIMER}</p>
        </div>
      ) : null}
      {initial.can_add_artist_note ? (
        <div className="grid gap-2">
          <Field id="nota-artista" label="Cómo usaste este equipo" optional hint="Por ejemplo: «Usado en la gira 2024». Hasta 140 caracteres.">
            <Input name="artist_note" maxLength={140} defaultValue={initial.artist_note ?? ""} />
          </Field>
          <p className="t-meta">{ARTIST_DISCLAIMER}</p>
        </div>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div><Button type="submit" variant="secondary" loading={busy}>Guardar</Button></div>
    </form>
  );
}
