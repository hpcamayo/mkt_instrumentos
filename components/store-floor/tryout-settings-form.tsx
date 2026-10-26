"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageNotice } from "@/components/page-notice";
import { Button, IconButton } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import {
  DAYS_AHEAD_CHOICES, NOTICE_HOUR_CHOICES, QUARTER_HOURS, SLOT_MINUTE_CHOICES, STORE_NOTE_MAX, WEEKDAYS, hourLabel,
  hoursSummary, splitForSecondRange, tryoutErrorMessage, type TryoutSettings, type WeeklyHours,
} from "@/lib/store-floor/tryouts";

// buy-07: when the store takes try-outs. Hours are their own (not the free-text opening hours of the store profile)
// because slots are computed from them. Nothing is on until the owner turns it on.

// A starting point the owner edits: weekdays 10 a. m. to 7 p. m., Saturday morning.
const SUGGESTED_HOURS: WeeklyHours = {
  "1": [["10:00", "19:00"]], "2": [["10:00", "19:00"]], "3": [["10:00", "19:00"]], "4": [["10:00", "19:00"]],
  "5": [["10:00", "19:00"]], "6": [["10:00", "14:00"]],
};

function HourSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="w-auto min-w-32">
      {QUARTER_HOURS.map((hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
    </Select>
  );
}

export function TryoutSettingsForm({ initial }: { initial: TryoutSettings }) {
  const router = useRouter();
  const hasHours = Object.values(initial.weekly_hours ?? {}).some((ranges) => ranges.length);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [hours, setHours] = useState<WeeklyHours>(hasHours ? initial.weekly_hours : SUGGESTED_HOURS);
  const [slot, setSlot] = useState(String(initial.slot_minutes));
  const [capacity, setCapacity] = useState(String(initial.capacity));
  const [notice, setNotice] = useState(String(initial.min_notice_hours));
  const [ahead, setAhead] = useState(String(initial.max_days_ahead));
  const [note, setNote] = useState(initial.note ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  function setDay(key: string, ranges: [string, string][]) {
    setHours((current) => ({ ...current, [key]: ranges }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient() as unknown as SupabaseClient | null;
    if (!supabase) return setFeedback({ kind: "error", message: "No pudimos conectar. Intenta nuevamente." });
    const weekly = Object.fromEntries(Object.entries(hours).filter(([, ranges]) => ranges.length));
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.rpc("set_store_tryout_settings", {
      p_fields: {
        enabled,
        weekly_hours: weekly,
        slot_minutes: Number(slot),
        capacity: Number(capacity),
        min_notice_hours: Number(notice),
        max_days_ahead: Number(ahead),
        note: note.trim() || null,
      },
    });
    setBusy(false);
    if (error) return setFeedback({ kind: "error", message: tryoutErrorMessage(error.message) });
    setFeedback({ kind: "success", message: enabled ? "Guardado. Tus publicaciones con stock muestran “Reservar una prueba”." : "Guardado. Las reservas de prueba están apagadas; las ya pedidas se mantienen." });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-6 rounded-panel border border-subtle bg-white p-5">
      {feedback ? <PageNotice kind={feedback.kind} message={feedback.message} /> : null}
      <Checkbox
        checked={enabled}
        onChange={(event) => setEnabled(event.target.checked)}
        label="Recibir reservas de prueba"
        description="Quien mira una publicación con stock elige día y hora; tú confirmas en Laria. Reserva un horario, no el instrumento."
      />

      <fieldset className="grid min-w-0 gap-3">
        <legend className="mb-1 t-ui font-semibold text-ink">Horario para pruebas</legend>
        <p className="t-meta">{hoursSummary(hours)}</p>
        <ul className="grid gap-3">
          {WEEKDAYS.map((day) => {
            const ranges = hours[day.key] ?? [];
            return (
              <li key={day.key} className="grid gap-2 border-b border-subtle pb-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:items-start">
                <Checkbox
                  checked={ranges.length > 0}
                  onChange={(event) => setDay(day.key, event.target.checked ? [["10:00", "19:00"]] : [])}
                  label={day.label}
                />
                {ranges.length ? (
                  <div className="grid gap-2">
                    {ranges.map(([from, to], index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <HourSelect label={`${day.label}: desde`} value={from} onChange={(value) => setDay(day.key, ranges.map((range, position) => (position === index ? [value, range[1]] : range)))} />
                        <span className="t-ui text-ink-2">a</span>
                        <HourSelect label={`${day.label}: hasta`} value={to} onChange={(value) => setDay(day.key, ranges.map((range, position) => (position === index ? [range[0], value] : range)))} />
                        {index === 1 ? (
                          <IconButton label={`Quitar el segundo horario del ${day.label.toLowerCase()}`} icon={<X aria-hidden />} variant="quiet" size="sm" onClick={() => setDay(day.key, ranges.slice(0, 1))} />
                        ) : null}
                      </div>
                    ))}
                    {ranges.length === 1 ? (
                      <button type="button" className="link inline-flex min-h-6 w-fit items-center gap-1 t-meta font-semibold" onClick={() => setDay(day.key, splitForSecondRange(ranges[0]))}>
                        <Plus aria-hidden className="h-4 w-4" />Agregar otro horario (por ejemplo, después del almuerzo)
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="t-meta sm:pt-1">Sin pruebas</p>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pruebas-duracion" label="Duración de cada prueba">
          <Select value={slot} onChange={(event) => setSlot(event.target.value)}>
            {SLOT_MINUTE_CHOICES.map((minutes) => <option key={minutes} value={minutes}>{minutes < 60 ? `${minutes} minutos` : minutes === 60 ? "1 hora" : "1 hora y media"}</option>)}
          </Select>
        </Field>
        <Field id="pruebas-capacidad" label="Personas a la vez" hint="Cuántas pruebas puedes atender al mismo tiempo.">
          <Select value={capacity} onChange={(event) => setCapacity(event.target.value)}>
            {[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}
          </Select>
        </Field>
        <Field id="pruebas-anticipacion" label="Con cuánta anticipación">
          <Select value={notice} onChange={(event) => setNotice(event.target.value)}>
            {NOTICE_HOUR_CHOICES.map((hoursAhead) => <option key={hoursAhead} value={hoursAhead}>{hoursAhead === 1 ? "1 hora antes" : hoursAhead < 24 ? `${hoursAhead} horas antes` : hoursAhead === 24 ? "1 día antes" : "2 días antes"}</option>)}
          </Select>
        </Field>
        <Field id="pruebas-hasta" label="Hasta cuántos días adelante">
          <Select value={ahead} onChange={(event) => setAhead(event.target.value)}>
            {DAYS_AHEAD_CHOICES.map((days) => <option key={days} value={days}>{days === 7 ? "1 semana" : days === 14 ? "2 semanas" : days === 21 ? "3 semanas" : days === 30 ? "1 mes" : `${days} días`}</option>)}
          </Select>
        </Field>
      </div>
      <Field id="pruebas-nota" label="Nota para quien reserva" optional hint="Por ejemplo: “Tenemos sala de pruebas; trae tus audífonos si quieres”.">
        <Textarea rows={2} maxLength={STORE_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Button type="submit" loading={busy} loadingLabel="Guardando…" className="w-fit">Guardar</Button>
    </form>
  );
}
