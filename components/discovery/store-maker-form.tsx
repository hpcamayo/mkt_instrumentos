"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { postDiscovery } from "@/components/discovery/post-json";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { MAKER_KIND_HINTS, MAKER_KIND_LABELS, giftExchangeLabel, type MakerKind } from "@/lib/discovery/makers";

export type StoreMakerProfile = { kind: MakerKind; craft_city: string; story: string | null; since_year: number | null; hidden_reason: string | null } | null;
export type StoreGiftPolicy = { exchange_days: number; note: string | null } | null;

type Message = { tone: "success" | "danger"; text: string } | null;

// disc-04: the store says it is a Fabricante or a Taller, where it makes its instruments and its story. Off by
// default; turning it off is one button, like turning it on.
export function StoreMakerForm({ profile, defaultCity }: { profile: StoreMakerProfile; defaultCity: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<MakerKind | "">(profile?.kind ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const hidden = Boolean(profile?.hidden_reason);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !kind) return;
    const form = new FormData(event.currentTarget);
    const year = String(form.get("since_year") ?? "").trim();
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/discovery/store", {
      action: "maker",
      kind,
      craftCity: String(form.get("craft_city") ?? ""),
      story: String(form.get("story") ?? "").trim() || null,
      sinceYear: year ? Number(year) : null,
    });
    setBusy(false);
    setMessage(result.ok ? { tone: "success", text: "Guardado. Ya puedes marcar tus publicaciones como hechas por tu taller." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/discovery/store", { action: "maker", kind: null });
    setBusy(false);
    if (result.ok) {
      setKind("");
      setMessage({ tone: "success", text: "Listo. Tu tienda ya no aparece en Hecho en Perú y tus publicaciones dejaron de mostrar las marcas." });
      router.refresh();
    } else setMessage({ tone: "danger", text: result.message });
  }

  if (hidden) {
    return <Notice tone="warning" title="Laria ocultó tu perfil de fabricante">{profile?.hidden_reason} Escríbenos si quieres revisarlo.</Notice>;
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      <div role="radiogroup" aria-labelledby="taller-tipo" className="grid gap-2">
        <p id="taller-tipo" className="t-ui font-semibold text-ink">¿Haces tus propios instrumentos?</p>
        {(Object.keys(MAKER_KIND_LABELS) as MakerKind[]).map((value) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1.5">
            <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-ink" />
            <span className="min-w-0">
              <span className="block t-body text-ink">{MAKER_KIND_LABELS[value]}</span>
              <span className="block t-meta">{MAKER_KIND_HINTS[value]}</span>
            </span>
          </label>
        ))}
      </div>
      {kind ? (
        <>
          <Field id="taller-ciudad" label="Ciudad donde los haces" hint="Se muestra como «Hecho a mano en Ayacucho».">
            <Input name="craft_city" defaultValue={profile?.craft_city ?? defaultCity} required minLength={2} maxLength={60} />
          </Field>
          <Field id="taller-anio" label="Año en que empezaste" optional>
            <Input name="since_year" inputMode="numeric" pattern="[0-9]{4}" defaultValue={profile?.since_year ?? ""} className="max-w-32" />
          </Field>
          <Field id="taller-historia" label="Tu historia" optional hint="Quién hace los instrumentos, con qué maderas y cómo aprendió. Entre 40 y 1500 caracteres.">
            <Textarea name="story" defaultValue={profile?.story ?? ""} maxLength={1500} />
          </Field>
          <p className="t-meta">Esto lo declara tu tienda. Laria no verifica cómo ni dónde se hacen los instrumentos, y puede ocultar el perfil si recibe reportes.</p>
        </>
      ) : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!kind} loading={busy}>Guardar</Button>
        {profile ? <Button type="button" variant="secondary" onClick={turnOff} disabled={busy}>Dejar de mostrarlo</Button> : null}
      </div>
    </form>
  );
}

// buy-05: the store says whether it accepts gift exchanges and for how long. Shown on the gift finder and the store
// page; the condition is the store's own.
export function StoreGiftForm({ policy }: { policy: StoreGiftPolicy }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/discovery/store", {
      action: "gift",
      days: Number(form.get("days")),
      note: String(form.get("note") ?? "").trim() || null,
    });
    setBusy(false);
    setMessage(result.ok ? { tone: "success", text: "Guardado." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  async function turnOff() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/discovery/store", { action: "gift", days: null });
    setBusy(false);
    setMessage(result.ok ? { tone: "success", text: "Listo. Ya no apareces entre las tiendas que aceptan cambios de regalos." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-4">
      {policy ? <p className="t-ui text-ink">Hoy: {giftExchangeLabel(policy.exchange_days)}.</p> : null}
      <Field id="regalo-dias" label="Días para cambiar un regalo" hint="Entre 3 y 60 días desde la compra.">
        <Input name="days" type="number" min={3} max={60} required defaultValue={policy?.exchange_days ?? ""} className="max-w-32" />
      </Field>
      <Field id="regalo-condicion" label="Condición" optional hint="Por ejemplo: «Con boleta y en su caja, sin uso». Hasta 200 caracteres.">
        <Input name="note" maxLength={200} defaultValue={policy?.note ?? ""} />
      </Field>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>Guardar</Button>
        {policy ? <Button type="button" variant="secondary" onClick={turnOff} disabled={busy}>No acepto cambios</Button> : null}
      </div>
    </form>
  );
}
