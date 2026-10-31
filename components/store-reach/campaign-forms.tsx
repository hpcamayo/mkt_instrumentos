"use client";

import { type FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Radio } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PriceInput } from "@/components/ui/price-input";
import { Textarea } from "@/components/ui/textarea";
import {
  AFTER_CAMPAIGN_LABELS,
  CAMPAIGN_MAX_DAYS,
  isoToLimaLocal,
  limaLocalToIso,
  type Campaign,
  type CampaignListingOption,
} from "@/lib/campaigns";
import { formatPrice, parseWholeSolPrice } from "@/lib/price";

// reach-05 "Campañas Laria" (docs/feature-ideas/store-reach.md): the store's and Admin's forms. Nothing is chosen for
// the store: the campaign price starts empty and the choice for the end has no default.

type Message = { tone: "success" | "danger"; text: string } | null;

export function CampaignJoinForm({ campaign, option }: { campaign: Pick<Campaign, "id" | "minDiscountPct" | "phase">; option: CampaignListingOption }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const max = option.maxCampaignPrice;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const price = parseWholeSolPrice(String(data.get("price") ?? ""));
    const after = data.get("after");
    if (price === null) return setMessage({ tone: "danger", text: "Escribe el precio de campaña en soles, sin decimales." });
    if (max !== null && price > max) return setMessage({ tone: "danger", text: `El precio de campaña debe ser ${formatPrice(max)} o menos.` });
    if (after !== "restore" && after !== "keep") return setMessage({ tone: "danger", text: "Elige qué pasa con el precio cuando termine la campaña." });
    setBusy(true);
    setMessage(null);
    const result = await post("/api/store/campaigns", { action: "join", campaignId: campaign.id, listingId: option.id, price, after });
    setBusy(false);
    if (!result.ok) return setMessage({ tone: "danger", text: result.message });
    setMessage({
      tone: "success",
      text: result.entry?.status === "live" ? "Listo: la publicación ya está en la campaña con el precio que elegiste." : "Listo: Laria pondrá tu precio de campaña cuando empiece.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3" noValidate>
      <Field
        id={`${id}-precio`}
        label="Precio de campaña"
        hint={max !== null && option.referencePrice !== null
          ? `Hasta ${formatPrice(max)}: al menos ${campaign.minDiscountPct} % menos que ${formatPrice(option.referencePrice)}, el precio más bajo de los últimos 30 días.`
          : undefined}
      >
        <PriceInput name="price" required />
      </Field>
      <fieldset className="grid gap-0.5">
        <legend className="t-ui font-semibold text-ink">Cuando termine la campaña</legend>
        <Radio name="after" value="restore" required label={AFTER_CAMPAIGN_LABELS.restore}
          description={option.price !== null ? `Laria vuelve a poner ${formatPrice(option.price)}, salvo que hayas cambiado el precio.` : undefined} />
        <Radio name="after" value="keep" label={AFTER_CAMPAIGN_LABELS.keep} description="El precio de campaña queda hasta que lo cambies." />
      </fieldset>
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Inscribiendo…">
        {campaign.phase === "live" ? "Inscribir y aplicar ahora" : "Inscribir"}
      </Button>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </form>
  );
}

export function CampaignWithdrawButton({ entryId, live, restore }: { entryId: string; live: boolean; restore: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function withdraw() {
    setBusy(true);
    const result = await post("/api/store/campaigns", { action: "withdraw", entryId });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    router.refresh();
  }
  return (
    <div className="grid gap-1">
      <Button size="sm" variant="secondary" onClick={() => void withdraw()} loading={busy} loadingLabel="Retirando…">Sacar de la campaña</Button>
      {live ? <p className="t-meta">{restore ? "Vuelve a su precio anterior." : "Mantiene el precio de campaña hasta que lo cambies."}</p> : null}
      {message ? <p role="alert" className="t-meta text-danger">{message}</p> : null}
    </div>
  );
}

// Admin: a new campaign (no campaign) or the edit of one. Dates are Lima time.
export function AdminCampaignForm({ campaign }: { campaign?: Campaign }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const started = Boolean(campaign && campaign.status === "published" && campaign.phase !== "upcoming");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const startsAt = limaLocalToIso(String(data.get("startsAt") ?? ""));
    const endsAt = limaLocalToIso(String(data.get("endsAt") ?? ""));
    const minDiscountPct = Number(data.get("minDiscountPct"));
    if (!startsAt || !endsAt) return setMessage({ tone: "danger", text: "Indica el inicio y el fin." });
    setBusy(true);
    setMessage(null);
    const result = await post("/api/admin/campaigns", {
      action: "save",
      id: campaign?.id ?? null,
      expectedRevision: campaign?.revision,
      slug: String(data.get("slug") ?? "").trim().toLowerCase(),
      name: String(data.get("name") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      startsAt,
      endsAt,
      minDiscountPct,
    });
    setBusy(false);
    if (!result.ok) return setMessage({ tone: "danger", text: result.message });
    if (!campaign && result.campaign?.id) {
      router.push(`/admin/campanas/${result.campaign.id}`);
      return;
    }
    setMessage({ tone: "success", text: "Campaña guardada." });
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-nombre`} label="Nombre" hint="Por ejemplo, Navidad 2026.">
          <Input name="name" required minLength={3} maxLength={80} defaultValue={campaign?.name} />
        </Field>
        <Field id={`${id}-direccion`} label="Dirección" hint="Minúsculas, números y guiones: laria.pe/campanas/navidad-2026.">
          <Input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} defaultValue={campaign?.slug} disabled={started} />
        </Field>
        <Field id={`${id}-inicio`} label="Empieza" hint="Hora de Lima.">
          <Input name="startsAt" type="datetime-local" required defaultValue={campaign ? isoToLimaLocal(campaign.startsAt) : undefined} disabled={started} />
        </Field>
        <Field id={`${id}-fin`} label="Termina" hint={`Hora de Lima. Como máximo ${CAMPAIGN_MAX_DAYS} días después del inicio.`}>
          <Input name="endsAt" type="datetime-local" required defaultValue={campaign ? isoToLimaLocal(campaign.endsAt) : undefined} disabled={started} />
        </Field>
        <Field id={`${id}-descuento`} label="Descuento mínimo (%)" hint="Respecto del precio más bajo de los 30 días anteriores. De 5 a 70.">
          <Input name="minDiscountPct" type="number" inputMode="numeric" min={5} max={70} step={1} required defaultValue={campaign?.minDiscountPct ?? 10} disabled={started} />
        </Field>
      </div>
      <Field id={`${id}-descripcion`} label="Descripción" optional hint="Una o dos frases para la página de la campaña. Sin urgencia ni cuentas regresivas.">
        <Textarea name="description" maxLength={600} defaultValue={campaign?.description} />
      </Field>
      {started ? <p className="t-meta">La campaña ya empezó: solo cambian el nombre y la descripción.</p> : null}
      {started ? <StartedValues campaign={campaign!} /> : null}
      <Button type="submit" className="justify-self-start" loading={busy} loadingLabel="Guardando…">{campaign ? "Guardar cambios" : "Crear borrador"}</Button>
      {message ? <Notice tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>{message.text}</Notice> : null}
    </form>
  );
}

// Disabled fields are not submitted; a started campaign sends its fixed values unchanged.
function StartedValues({ campaign }: { campaign: Campaign }) {
  return (
    <>
      <input type="hidden" name="slug" value={campaign.slug} />
      <input type="hidden" name="startsAt" value={isoToLimaLocal(campaign.startsAt)} />
      <input type="hidden" name="endsAt" value={isoToLimaLocal(campaign.endsAt)} />
      <input type="hidden" name="minDiscountPct" value={campaign.minDiscountPct} />
    </>
  );
}

export function AdminCampaignStatus({ campaign, canUnpublish }: { campaign: Campaign; canUnpublish: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const actions: { status: "published" | "draft" | "cancelled"; label: string }[] = [];
  if (campaign.status === "draft") actions.push({ status: "published", label: "Publicar" });
  if (campaign.status === "published" && campaign.phase === "upcoming" && canUnpublish) actions.push({ status: "draft", label: "Volver a borrador" });
  if (campaign.status === "published" && (campaign.phase === "upcoming" || campaign.phase === "live")) actions.push({ status: "cancelled", label: "Cancelar campaña" });
  if (!actions.length) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value;
    if (!status || busy) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (status === "cancelled" && reason.length < 3) return setMessage({ tone: "danger", text: "Escribe el motivo de la cancelación; las tiendas inscritas lo verán." });
    setBusy(status);
    setMessage(null);
    const result = await post("/api/admin/campaigns", { action: "status", id: campaign.id, status, expectedRevision: campaign.revision, reason: reason || undefined });
    setBusy(null);
    if (!result.ok) return setMessage({ tone: "danger", text: result.message });
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      {actions.some((action) => action.status === "cancelled") ? (
        <Field id={`${id}-motivo`} label="Motivo de la cancelación" hint="Solo para cancelar. Las publicaciones inscritas salen y vuelven a su precio si la tienda lo pidió.">
          <Input name="reason" maxLength={400} />
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.status} type="submit" name="status" value={action.status} variant={action.status === "cancelled" ? "danger" : "secondary"}
            loading={busy === action.status} loadingLabel="Guardando…">
            {action.label}
          </Button>
        ))}
      </div>
      {message ? <Notice tone={message.tone} role="alert">{message.text}</Notice> : null}
    </form>
  );
}

export function AdminRemoveEntry({ entryId }: { entryId: string }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 3) return setMessage("Escribe el motivo; la tienda lo verá.");
    setBusy(true);
    const result = await post("/api/admin/campaigns", { action: "remove", entryId, reason });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    router.refresh();
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
      <Field id={`${id}-motivo`} label="Motivo para retirarla">
        <Input name="reason" maxLength={400} />
      </Field>
      <Button type="submit" size="sm" variant="danger" loading={busy} loadingLabel="Retirando…">Retirar</Button>
      {message ? <p role="alert" className="t-meta text-danger sm:col-span-2">{message}</p> : null}
    </form>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(url: string, body: Record<string, unknown>): Promise<any> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) return { ok: false, message: payload?.message ?? "No se pudo completar. Intenta nuevamente." };
    return payload;
  } catch {
    return { ok: false, message: "No se pudo completar. Revisa tu conexión." };
  }
}
