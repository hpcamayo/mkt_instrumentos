"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { refreshListingPages } from "@/lib/listing-page-refresh";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const limaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const addDays = (isoDate: string, days: number) => {
  const value = new Date(`${isoDate}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function formatReturnDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

// mine-12: "Me voy de viaje". Every listing stays public with "Vuelve el …" and WhatsApp off until the return date;
// availability questions pause too. Ending it early is one button, as easy as starting it.
export function VacationMode({ pausedUntil }: { pausedUntil: string | null }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = limaToday();
  const active = pausedUntil !== null && pausedUntil > today;

  async function save(until: string | null) {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc("set_owned_listings_pause", { p_until: until });
    if (failure) {
      setBusy(false);
      return setError(failure.message.includes("LISTING_PAUSE_INVALID") ? "Elige una fecha entre mañana y los próximos 90 días." : "No pudimos guardar el cambio. Inténtalo de nuevo.");
    }
    await refreshListingPages({ owned: true });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const until = String(new FormData(event.currentTarget).get("until") ?? "");
    void save(until || null);
  }

  return (
    <section aria-labelledby="vacaciones-titulo" className="rounded-panel border border-subtle bg-white p-5">
      <h2 id="vacaciones-titulo" className="t-section text-ink">Modo vacaciones</h2>
      {active ? (
        <>
          <p className="mt-2 t-body text-ink-2">Tus publicaciones muestran «Vuelve el {formatReturnDate(pausedUntil)}» y no reciben mensajes hasta esa fecha.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy} loadingLabel="Guardando…" onClick={() => void save(null)}>Ya volví</Button>
            <Button variant="quiet" disabled={busy} aria-expanded={open} onClick={() => setOpen((current) => !current)}>Cambiar fecha</Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 t-body text-ink-2">Si no vas a poder responder, pausa tus publicaciones hasta tu regreso en vez de ocultarlas una por una.</p>
          {!open ? <Button className="mt-3" variant="secondary" aria-expanded={open} onClick={() => setOpen(true)}>Pausar publicaciones</Button> : null}
        </>
      )}
      {open ? (
        <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
          <Field id="vacaciones-fecha" label="Vuelvo el" hint="Hasta 90 días." className="w-48">
            <Input name="until" type="date" min={addDays(today, 1)} max={addDays(today, 90)} defaultValue={active ? pausedUntil ?? undefined : addDays(today, 7)} required />
          </Field>
          <Button type="submit" variant="secondary" loading={busy} loadingLabel="Guardando…">Guardar</Button>
          <Button variant="quiet" disabled={busy} onClick={() => setOpen(false)}>Cancelar</Button>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-2 t-meta font-semibold text-danger">{error}</p> : null}
    </section>
  );
}
