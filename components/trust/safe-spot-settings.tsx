"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { readSafeSpotSettings, trustErrorMessage, type SafeSpotSettings } from "@/lib/deal-trust";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const MISSING_COPY: Record<SafeSpotSettings["missing"][number], string> = {
  active: "Tu tienda tiene que estar activa en Laria.",
  verified: "Tu tienda tiene que estar verificada por Laria.",
  address: "Agrega la dirección de tu local en el perfil de la tienda.",
  show_address: "Elige mostrar la dirección en tu página, en el perfil de la tienda.",
};

// «Punto seguro Laria» (safe-03) in Mi tienda: a verified store that shows its address can offer its premises, during
// its opening hours, as a place where buyers and sellers meet to check an instrument. It is opt-in, can be turned off
// at any time, and Laria can withdraw it. The store doesn't check instruments or take payments, and the copy says so.
export function SafeSpotSettingsCard({ initial }: { initial: SafeSpotSettings }) {
  const id = useId();
  const [settings, setSettings] = useState(initial);
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const eligible = settings.missing.length === 0 && !settings.adminDisabled;

  async function save(enabled: boolean) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { data, error } = await (supabase as unknown as SupabaseClient).rpc("set_my_safe_spot", { p_enabled: enabled, p_note: note.trim() || null });
    setBusy(false);
    const next = error ? null : readSafeSpotSettings(data);
    setFailed(!next);
    if (!next) {
      setMessage(trustErrorMessage(error?.message ?? "SAFE_SPOT"));
      return;
    }
    setSettings(next);
    setNote(next.note ?? "");
    setMessage(next.enabled ? "Tu tienda aparece como Punto seguro Laria." : "Tu tienda ya no aparece como Punto seguro.");
  }

  return (
    <section aria-labelledby={`${id}-titulo`} className="grid gap-3 rounded-panel border border-subtle bg-white p-4 sm:p-5">
      <h2 id={`${id}-titulo`} className="flex items-center gap-2 t-section text-ink">
        <ShieldCheck aria-hidden className="h-5 w-5 shrink-0" />
        Punto seguro Laria
      </h2>
      <p className="max-w-[68ch] t-ui text-ink-2">
        Ofrece tu local, en tu horario, como lugar donde compradores y vendedores de Laria pueden verse para revisar un
        instrumento. Tu tienda aparece en «Encuentro seguro» de las publicaciones de tu ciudad y lleva la marca en tu página.
        No revisas el instrumento, no recibes pagos y no participas en el trato.
      </p>
      {settings.adminDisabled ? (
        <Notice tone="warning" role="note" title="Laria quitó tu tienda de los Puntos seguros">
          {settings.adminDisabledReason ? <p className="mt-1">{settings.adminDisabledReason}</p> : null}
          <p className="mt-1">Escríbenos si crees que es un error.</p>
        </Notice>
      ) : settings.missing.length ? (
        <div className="grid gap-1">
          <p className="t-ui font-semibold text-ink">Para ofrecerlo te falta:</p>
          <ul className="grid list-disc gap-1 pl-5 t-ui text-ink-2">
            {settings.missing.map((item) => <li key={item}>{MISSING_COPY[item]}</li>)}
          </ul>
        </div>
      ) : (
        <>
          {settings.address ? <p className="t-ui text-ink">Dirección que se muestra: <span className="font-semibold">{settings.address}</span></p> : null}
          <Field id={`${id}-nota`} label="Nota para quienes vienen" optional hint="Por ejemplo: «Pregunta en caja; hay una mesa para probar». Sin teléfonos ni enlaces. Hasta 200 caracteres.">
            <Textarea value={note} maxLength={200} rows={2} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {settings.enabled ? (
              <>
                <Button variant="secondary" size="sm" loading={busy} onClick={() => void save(true)}>Guardar la nota</Button>
                <Button variant="quiet" size="sm" disabled={busy} onClick={() => void save(false)}>Dejar de ser Punto seguro</Button>
              </>
            ) : (
              <Button variant="secondary" size="sm" loading={busy} disabled={!eligible} onClick={() => void save(true)}>Ofrecer mi local como Punto seguro</Button>
            )}
          </div>
        </>
      )}
      {message ? <p role={failed ? "alert" : "status"} className={failed ? "t-meta font-semibold text-danger" : "t-meta"}>{message}</p> : null}
    </section>
  );
}
