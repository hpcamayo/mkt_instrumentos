"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageNotice } from "@/components/page-notice";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio, Select } from "@/components/ui/field";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  RETURNS_DAY_CHOICES, RETURNS_NOTE_MAX, WARRANTY_MONTH_CHOICES, returnsLine, termsErrorMessage, termsForm, termsPayload,
  termsSummary, warrantyLine, type ConditionGroup, type StoreTerms,
} from "@/lib/store-floor/warranty";

// reach-09: the store's warranty and returns per condition group, and own terms for one listing. Both write through
// security-definer functions bound to the owner (set_store_warranty_policy, set_listing_store_terms).

type FormState = ReturnType<typeof termsForm>;
type Feedback = { kind: "success" | "error"; message: string } | null;

function client() {
  return getSupabaseBrowserClient() as unknown as SupabaseClient | null;
}

function TermsFields({ id, value, onChange }: { id: string; value: FormState; onChange: (next: FormState) => void }) {
  const months = Number(value.warranty);
  const days = Number(value.returns);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-garantia`} label="Garantía">
          <Select value={value.warranty} onChange={(event) => onChange({ ...value, warranty: event.target.value })}>
            <option value="">No indicar</option>
            <option value="0">Sin garantía adicional</option>
            {WARRANTY_MONTH_CHOICES.map((choice) => <option key={choice} value={choice}>{choice === 1 ? "1 mes" : `${choice} meses`}</option>)}
          </Select>
        </Field>
        <Field id={`${id}-cambios`} label="Cambios y devoluciones">
          <Select value={value.returns} onChange={(event) => onChange({ ...value, returns: event.target.value })}>
            <option value="">No indicar</option>
            <option value="0">No acepta cambios</option>
            {RETURNS_DAY_CHOICES.map((choice) => <option key={choice} value={choice}>{`Hasta ${choice} días`}</option>)}
          </Select>
        </Field>
      </div>
      {value.warranty !== "" && months > 0 ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 t-ui font-semibold text-ink">¿Quién da la garantía?</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Radio name={`${id}-proveedor`} checked={value.provider === "store"} onChange={() => onChange({ ...value, provider: "store" })} label="Tu tienda" />
            <Radio name={`${id}-proveedor`} checked={value.provider === "brand"} onChange={() => onChange({ ...value, provider: "brand" })} label="La marca (garantía oficial)" />
          </div>
        </fieldset>
      ) : null}
      {value.returns !== "" && days > 0 ? (
        <Field id={`${id}-condicion`} label="Condición para cambios" optional hint="Por ejemplo: con boleta y empaque original.">
          <Input value={value.note} maxLength={RETURNS_NOTE_MAX} onChange={(event) => onChange({ ...value, note: event.target.value })} />
        </Field>
      ) : null}
    </div>
  );
}

function Preview({ value }: { value: FormState }) {
  const payload = termsPayload(value) as Partial<StoreTerms>;
  const lines = [warrantyLine(payload), returnsLine(payload)].filter(Boolean);
  return (
    <div className="rounded-control bg-canvas px-3 py-2">
      <p className="t-meta font-semibold text-ink-2">Así se ve en la publicación</p>
      {lines.length ? lines.map((line) => <p key={line} className="t-ui text-ink">{line}</p>) : <p className="t-ui text-ink-2">No se muestra nada.</p>}
    </div>
  );
}

export function PolicyForm({ group, label, hint, initial, listingCount }: { group: ConditionGroup; label: string; hint: string; initial: Partial<StoreTerms> | null; listingCount: number }) {
  const router = useRouter();
  const [value, setValue] = useState(() => termsForm(initial));
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = client();
    if (!supabase) return setFeedback({ kind: "error", message: "No pudimos conectar. Intenta nuevamente." });
    setBusy(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc("set_store_warranty_policy", { p_condition_group: group, p_fields: termsPayload(value) });
    setBusy(false);
    if (error) return setFeedback({ kind: "error", message: termsErrorMessage(error.message) });
    const updated = Number((data as { listings_updated?: number } | null)?.listings_updated ?? 0);
    setFeedback({ kind: "success", message: `Guardado. ${updated === 1 ? "1 publicación muestra" : `${updated} publicaciones muestran`} esta línea.` });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-panel border border-subtle bg-white p-5" aria-labelledby={`politica-${group}`}>
      <div className="grid gap-0.5">
        <h2 id={`politica-${group}`} className="t-section text-ink">{label}</h2>
        <p className="t-meta">{hint} {listingCount === 1 ? "1 publicación de tu tienda." : `${listingCount} publicaciones de tu tienda.`}</p>
      </div>
      {feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null}
      <TermsFields id={`politica-${group}`} value={value} onChange={setValue} />
      <Preview value={value} />
      <Button type="submit" loading={busy} loadingLabel="Guardando…" className="w-fit">Guardar</Button>
    </form>
  );
}

export type TermsListing = Partial<StoreTerms> & {
  id: string;
  title: string;
  condition: string | null;
  status: string;
  store_terms_source: "store_policy" | "listing" | null;
};

// Own terms for one listing (a demo unit with a shorter warranty, a model with the brand's warranty). Back to the
// policy with one tap.
export function ListingTermsManager({ listings }: { listings: TermsListing[] }) {
  const router = useRouter();
  const own = listings.filter((listing) => listing.store_terms_source === "listing");
  const [selected, setSelected] = useState<string>("");
  const target = listings.find((listing) => listing.id === selected) ?? null;
  const [value, setValue] = useState(() => termsForm(null));
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  function choose(id: string) {
    setSelected(id);
    setFeedback(null);
    const listing = listings.find((entry) => entry.id === id);
    setValue(termsForm(listing ?? null));
  }

  async function write(listingId: string, terms: Record<string, unknown> | null, done: string) {
    const supabase = client();
    if (!supabase) return setFeedback({ kind: "error", message: "No pudimos conectar. Intenta nuevamente." });
    setBusy(listingId);
    setFeedback(null);
    const { error } = await supabase.rpc("set_listing_store_terms", { p_listing_id: listingId, p_terms: terms });
    setBusy(null);
    if (error) return setFeedback({ kind: "error", message: termsErrorMessage(error.message) });
    setFeedback({ kind: "success", message: done });
    setSelected("");
    router.refresh();
  }

  return (
    <section aria-labelledby="condiciones-propias" className="grid gap-4 rounded-panel border border-subtle bg-white p-5">
      <div className="grid gap-0.5">
        <h2 id="condiciones-propias" className="t-section text-ink">Una publicación con otras condiciones</h2>
        <p className="t-meta">Para un equipo de exhibición, un modelo con garantía oficial o un usado revisado. El resto sigue tu política.</p>
      </div>
      {feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null}
      {own.length ? (
        <ul className="divide-y divide-subtle rounded-control border border-subtle">
          {own.map((listing) => (
            <li key={listing.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate t-ui font-semibold text-ink">{listing.title}</span>
                <span className="block t-meta">{termsSummary(listing)}</span>
              </span>
              <span className="flex gap-4">
                <button type="button" className="link inline-flex min-h-6 items-center font-semibold" onClick={() => choose(listing.id)}>Editar</button>
                <button type="button" className="link inline-flex min-h-6 items-center font-semibold" disabled={busy === listing.id} onClick={() => void write(listing.id, null, "Esa publicación vuelve a seguir tu política.")}>
                  {busy === listing.id ? "Guardando…" : "Usar la política"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <Field id="condiciones-publicacion" label="Publicación">
        <Select value={selected} onChange={(event) => choose(event.target.value)}>
          <option value="">Elige una publicación</option>
          {listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title}{listing.store_terms_source === "listing" ? " (condiciones propias)" : ""}</option>)}
        </Select>
      </Field>
      {target ? (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = termsPayload(value);
            // Nothing filled in means "like the others": the listing follows the policy again.
            void write(target.id, Object.keys(payload).length ? payload : null, Object.keys(payload).length ? "Guardado. La publicación muestra sus propias condiciones." : "Esa publicación sigue tu política.");
          }}
        >
          <TermsFields id="condiciones-propias-campos" value={value} onChange={setValue} />
          <Preview value={value} />
          <Button type="submit" loading={busy === target.id} loadingLabel="Guardando…" className="w-fit">Guardar para esta publicación</Button>
        </form>
      ) : null}
    </section>
  );
}
