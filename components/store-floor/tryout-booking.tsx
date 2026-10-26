"use client";

import { CalendarClock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PhoneInput } from "@/components/ui/phone-input";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { isValidWhatsAppPhone, normalizePeruPhone } from "@/lib/phone";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { whenLabel } from "@/lib/store-floor/dates";
import {
  BUYER_NOTE_MAX, buyerWhatsAppHref, groupSlots, newTryoutKey, tryoutErrorCode, tryoutErrorMessage,
  type Tryout, type TryoutSlots,
} from "@/lib/store-floor/tryouts";
import { cn } from "@/lib/utils";

// buy-07 "Reservar una prueba" on a store's available listing: pick a day and a time within the store's try-out hours;
// the store confirms in Laria and both sides can write on WhatsApp with the details filled in. It holds a time, never
// the instrument.

type State =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: TryoutSlots }
  | { kind: "done"; tryout: Tryout };

function client() {
  return getSupabaseBrowserClient() as unknown as SupabaseClient | null;
}

export function TryoutBooking({ listingId, storeName, className }: { listingId: string; storeName: string; className?: string }) {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  const opener = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>({ kind: "closed" });
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [buyer, setBuyer] = useState<{ name: string; phone: string } | null>(null);
  const [errors, setErrors] = useState<{ slot?: string; name?: string; phone?: string; note?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);

  async function loadSlots(keepMessage?: string) {
    const supabase = client();
    if (!supabase) return setState({ kind: "error", message: "No pudimos conectar. Intenta nuevamente." });
    const { data, error } = await supabase.rpc("get_listing_tryout_slots", { p_listing_id: listingId });
    if (error || !data) return setState({ kind: "error", message: "No pudimos cargar los horarios. Intenta nuevamente." });
    const slots = data as TryoutSlots;
    setState({ kind: "ready", data: slots });
    const days = groupSlots(slots.slots);
    setDay((current) => (current && days.some((entry) => entry.date === current) ? current : days[0]?.date ?? null));
    setSlot((current) => (current && slots.slots.includes(current) ? current : null));
    if (keepMessage) setErrors({ slot: keepMessage });
  }

  async function open() {
    setState({ kind: "loading" });
    setErrors({});
    requestKey.current = newTryoutKey();
    void loadSlots();
    if (account.authenticated && !buyer) {
      const supabase = client();
      const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
      if (supabase && auth.user) {
        const { data } = await supabase.from("profiles").select("full_name,phone").eq("id", auth.user.id).maybeSingle();
        const profile = data as { full_name: string | null; phone: string | null } | null;
        setBuyer({ name: profile?.full_name?.trim() ?? "", phone: profile?.phone ?? "" });
      }
    }
  }

  function close() {
    setState({ kind: "closed" });
    requestAnimationFrame(() => opener.current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const phone = String(form.get("phone") ?? "");
    const note = String(form.get("note") ?? "").trim();
    const next: typeof errors = {};
    if (!slot) next.slot = "Elige un horario.";
    if (name.length < 2 || name.length > 80) next.name = "Escribe tu nombre, de 2 a 80 caracteres.";
    if (!isValidWhatsAppPhone(phone)) next.phone = "Escribe un número de WhatsApp válido, por ejemplo 987 654 321.";
    if (note.length > BUYER_NOTE_MAX) next.note = `Hasta ${BUYER_NOTE_MAX} caracteres.`;
    setErrors(next);
    if (Object.keys(next).length) return;
    const supabase = client();
    if (!supabase) return setErrors({ form: "No pudimos conectar. Intenta nuevamente." });
    setBusy(true);
    const { data, error } = await supabase.rpc("request_store_tryout", {
      p_listing_id: listingId,
      p_starts_at: slot,
      p_buyer_name: name,
      p_buyer_phone: normalizePeruPhone(phone),
      p_note: note || null,
      p_request_key: requestKey.current,
    });
    setBusy(false);
    if (error) {
      const code = tryoutErrorCode(error.message);
      if (code === "TRYOUT_SLOT_TAKEN" || code === "TRYOUT_SLOT_INVALID") {
        requestKey.current = newTryoutKey();
        return void loadSlots(tryoutErrorMessage(error.message));
      }
      return setErrors({ form: tryoutErrorMessage(error.message) });
    }
    setState({ kind: "done", tryout: data as Tryout });
  }

  const days = state.kind === "ready" ? groupSlots(state.data.slots) : [];
  const times = days.find((entry) => entry.date === day)?.times ?? [];
  const loginHref = `/login?next=${encodeURIComponent(`${pathname}#prueba`)}`;

  return (
    <div id="prueba" className={cn("grid gap-1", className)}>
      <button ref={opener} type="button" aria-haspopup="dialog" onClick={() => void open()} className={buttonClasses({ variant: "secondary" })}>
        <CalendarClock aria-hidden />Reservar una prueba
      </button>
      <p className="t-meta">Elige día y hora para probarlo en {storeName}. Reservas un horario, no el instrumento.</p>

      {state.kind !== "closed" ? (
        <Sheet
          title={state.kind === "done" ? "Prueba pedida" : "Reservar una prueba"}
          closeLabel="Cerrar"
          onDismiss={close}
          layout="responsive"
          footer={state.kind === "ready" && state.data.available && state.data.slots.length && account.authenticated ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close}>Cancelar</Button>
              <Button type="submit" form="prueba-formulario" loading={busy} loadingLabel="Enviando…">Pedir la prueba</Button>
            </div>
          ) : undefined}
        >
          {state.kind === "loading" ? <p className="py-4 t-ui text-ink-2" role="status">Cargando horarios…</p> : null}
          {state.kind === "error" ? <Notice tone="danger" role="alert" className="mt-4">{state.message}</Notice> : null}
          {state.kind === "ready" && (!state.data.available || !state.data.slots.length) ? (
            <div className="grid gap-3 py-4">
              <p className="t-ui text-ink">{state.data.available ? `${storeName} no tiene horarios libres en los próximos días.` : "Esta publicación ya no recibe reservas de prueba."}</p>
              <p className="t-meta">Puedes escribir a la tienda por WhatsApp para coordinar.</p>
            </div>
          ) : null}
          {state.kind === "ready" && state.data.available && state.data.slots.length ? (
            <form id="prueba-formulario" className="grid gap-5 pt-4" onSubmit={submit} noValidate>
              {state.data.note ? <Notice tone="info" role="note">{state.data.store_name ?? storeName}: {state.data.note}</Notice> : null}
              <fieldset className="grid gap-2">
                <legend className="mb-1 t-ui font-semibold text-ink">Día</legend>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {days.map((entry) => (
                    <Chip key={entry.date} selected={day === entry.date} onClick={() => { setDay(entry.date); setSlot(null); }}>
                      <span className="first-letter:uppercase">{entry.label}</span>
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2" aria-describedby={errors.slot ? "prueba-hora-error" : undefined}>
                <legend className="mb-1 t-ui font-semibold text-ink">Hora{state.data.slot_minutes ? ` · ${state.data.slot_minutes} minutos` : ""}</legend>
                <div className="flex flex-wrap gap-2">
                  {times.map((time) => (
                    <Chip key={time.value} selected={slot === time.value} onClick={() => setSlot(time.value)}>{time.label}</Chip>
                  ))}
                </div>
                {errors.slot ? <p id="prueba-hora-error" role="alert" className="t-meta font-semibold text-danger">{errors.slot}</p> : null}
              </fieldset>
              {account.authenticated ? (
                <>
                  <Field id="prueba-nombre" label="Tu nombre" error={errors.name}>
                    <Input name="name" autoComplete="name" maxLength={80} defaultValue={buyer?.name ?? ""} key={`nombre-${buyer?.name ?? ""}`} />
                  </Field>
                  <Field id="prueba-whatsapp" label="Tu WhatsApp" hint="Solo lo ve la tienda, para coordinar la prueba." error={errors.phone}>
                    <PhoneInput name="phone" defaultValue={buyer?.phone ?? ""} key={`telefono-${buyer?.phone ?? ""}`} showPreview={false} />
                  </Field>
                  <Field id="prueba-mensaje" label="Mensaje para la tienda" optional hint="Por ejemplo: qué quieres probar o si traes tu equipo." error={errors.note}>
                    <Textarea name="note" rows={3} maxLength={BUYER_NOTE_MAX} />
                  </Field>
                  {errors.form ? <Notice tone="danger" role="alert">{errors.form}</Notice> : null}
                  <p className="t-meta">La tienda confirma en Laria y te avisamos. Puedes cancelar desde Mis pruebas.</p>
                </>
              ) : (
                <div className="grid gap-2">
                  <p className="t-ui text-ink">Ingresa para pedir la prueba: así la tienda sabe quién va y te avisamos cuando la confirme.</p>
                  <Link href={loginHref} className={buttonClasses({ className: "w-fit" })}>Ingresar para reservar</Link>
                </div>
              )}
            </form>
          ) : null}
          {state.kind === "done" ? <TryoutDone tryout={state.tryout} onClose={close} /> : null}
        </Sheet>
      ) : null}
    </div>
  );
}

function TryoutDone({ tryout, onClose }: { tryout: Tryout; onClose: () => void }) {
  const whatsapp = buyerWhatsAppHref(tryout);
  return (
    <div className="grid gap-4 py-4" role="status">
      <p className="t-ui text-ink">
        Pediste probar <strong>{tryout.listing_title}</strong> el <strong>{whenLabel(tryout.starts_at)}</strong>.
        {" "}{tryout.store?.name ?? "La tienda"} la confirma en Laria y te avisamos.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary" })}>
            <MessageCircle aria-hidden />Escribir a la tienda
          </a>
        ) : null}
        <Link href="/mi-cuenta/pruebas" className={buttonClasses({ variant: "secondary" })}>Ver mis pruebas</Link>
        <Button variant="quiet" onClick={onClose}>Listo</Button>
      </div>
    </div>
  );
}
