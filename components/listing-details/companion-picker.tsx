"use client";

import { useMemo, useState } from "react";
import { postDiscovery } from "@/components/discovery/post-json";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatPrice } from "@/lib/price";

// buy-01: up to six of the store's listings shown under this one as "Lo que suele acompañarlo", each with "Agregar al
// combo". Shown in the order chosen. Saved on its own, at once (not moderated content).
export type CompanionOption = { id: string; title: string; price_pen: number | null; status: string };

const MAX_COMPANIONS = 6;

export function CompanionPicker({ listingId, options, initial }: { listingId: string; options: CompanionOption[]; initial: string[] }) {
  const [chosen, setChosen] = useState<string[]>(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return words ? options.filter((option) => chosen.includes(option.id) || option.title.toLowerCase().includes(words)) : options;
  }, [options, chosen, query]);
  const full = chosen.length >= MAX_COMPANIONS;

  function toggle(id: string) {
    setMessage(null);
    setChosen((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= MAX_COMPANIONS ? current : [...current, id]));
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery(`/api/listings/${listingId}/manage`, { action: "companions", companionIds: chosen });
    setBusy(false);
    setMessage(result.ok
      ? { tone: "success", text: chosen.length ? "Guardado. Se muestra en la publicación." : "Guardado. La publicación ya no muestra acompañantes." }
      : { tone: "danger", text: result.message });
  }

  return (
    <section aria-labelledby="acompanantes-titulo" className="grid gap-4 rounded-panel border border-subtle bg-white p-4 md:p-5">
      <div>
        <h2 id="acompanantes-titulo" className="t-section text-ink">Lo que suele acompañarlo</h2>
        <p className="mt-1 max-w-[68ch] t-ui text-ink-2">
          Elige hasta {MAX_COMPANIONS} publicaciones de tu tienda que suelen llevarse con esta (un cable, una funda, un afinador). Se muestran
          debajo de la descripción, y el comprador puede sumarlas a su combo.
        </p>
        <p className="mt-2 t-meta font-semibold text-ink" aria-live="polite">{chosen.length} de {MAX_COMPANIONS} elegidas</p>
      </div>
      {options.length > 8 ? (
        <Field id="acompanantes-buscar" label="Buscar en tu tienda" optional>
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
      ) : null}
      <fieldset className="grid gap-1">
        <legend className="sr-only">Publicaciones de tu tienda</legend>
        <ul className="grid max-h-96 gap-1 overflow-y-auto pr-1">
          {shown.map((option) => {
            const position = chosen.indexOf(option.id);
            return (
              <li key={option.id}>
                <Checkbox
                  name="companions"
                  checked={position >= 0}
                  disabled={position < 0 && full}
                  onChange={() => toggle(option.id)}
                  label={position >= 0 ? `${position + 1}. ${option.title}` : option.title}
                  description={formatPrice(option.price_pen)}
                />
              </li>
            );
          })}
        </ul>
        {shown.length === 0 ? <p className="t-ui text-ink">Ninguna publicación coincide.</p> : null}
      </fieldset>
      {full ? <p className="t-meta">Ya elegiste {MAX_COMPANIONS}. Quita una para elegir otra.</p> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div><Button type="button" variant="secondary" onClick={save} loading={busy} loadingLabel="Guardando…">Guardar acompañantes</Button></div>
    </section>
  );
}
