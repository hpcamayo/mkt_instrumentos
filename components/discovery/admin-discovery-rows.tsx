"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { postDiscovery } from "@/components/discovery/post-json";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { MAKER_KIND_LABELS, handmadeLabel, type MakerKind } from "@/lib/discovery/makers";

type Message = { tone: "success" | "danger"; text: string } | null;

export type AdminMaker = {
  store_id: string;
  store_name: string;
  store_slug: string;
  store_status: string;
  is_verified: boolean;
  kind: MakerKind;
  craft_city: string;
  story: string | null;
  since_year: number | null;
  hidden_at: string | null;
  hidden_reason: string | null;
  handmade_listings: number;
};

// disc-04 Admin: a maker profile is the store's own declaration. Admin hides it (and its marks) when it is not true,
// or shows it again, always with a reason; both are audited on the store.
export function AdminMakerRow({ maker }: { maker: AdminMaker }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const hidden = Boolean(maker.hidden_at);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 3) {
      setMessage({ tone: "danger", text: "Indica el motivo." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/admin/discovery", { action: "maker_hidden", storeId: maker.store_id, hidden: !hidden, reason });
    setBusy(false);
    if (result.ok) router.refresh();
    else setMessage({ tone: "danger", text: result.message });
  }

  return (
    <li className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/tiendas/${maker.store_slug}`} className="link t-section">{maker.store_name}</Link>
        <Tag tone="line">{MAKER_KIND_LABELS[maker.kind]}</Tag>
        {hidden ? <Tag tone="warning">Oculto</Tag> : <Tag tone="accent">Visible</Tag>}
        {maker.is_verified ? <Tag>Tienda verificada</Tag> : null}
      </div>
      <p className="t-ui text-ink">{handmadeLabel(maker)}{maker.since_year ? ` · desde ${maker.since_year}` : ""} · {maker.handmade_listings} publicaciones hechas por su taller</p>
      {maker.story ? <p className="max-w-[68ch] whitespace-pre-line t-ui text-ink-2">{maker.story}</p> : null}
      {hidden && maker.hidden_reason ? <p className="t-meta">Motivo: {maker.hidden_reason}</p> : null}
      <form onSubmit={submit} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <Field id={`fabricante-${maker.store_id}-motivo`} label={hidden ? "Motivo para mostrarlo de nuevo" : "Motivo para ocultarlo"}>
          <Input name="reason" maxLength={500} />
        </Field>
        <Button type="submit" variant={hidden ? "secondary" : "danger"} loading={busy}>{hidden ? "Mostrar de nuevo" : "Ocultar perfil"}</Button>
      </form>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </li>
  );
}

export type AdminArtist = {
  user_id: string;
  email: string | null;
  slug: string;
  display_name: string;
  story: string | null;
  link_url: string | null;
  verified_at: string;
  revoked_at: string | null;
};

// disc-05 Admin: record a verified artist on an account (after checking who they are, outside Laria) or update one.
// "Cómo lo comprobaste" goes to the audit only.
export function AdminArtistForm({ artist }: { artist: AdminArtist | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const prefix = artist ? `artista-${artist.user_id.slice(0, 8)}` : "artista-nuevo";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/admin/discovery", {
      action: "save_artist",
      email: String(form.get("email") ?? "").trim(),
      slug: String(form.get("slug") ?? "").trim(),
      displayName: String(form.get("display_name") ?? "").trim(),
      story: String(form.get("story") ?? "").trim() || null,
      linkUrl: String(form.get("link_url") ?? "").trim() || null,
      check: String(form.get("check") ?? "").trim(),
    });
    setBusy(false);
    setMessage(result.ok ? { tone: "success", text: "Artista guardado." } : { tone: "danger", text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${prefix}-correo`} label="Correo de su cuenta en Laria">
          <Input name="email" type="email" required defaultValue={artist?.email ?? ""} readOnly={Boolean(artist)} />
        </Field>
        <Field id={`${prefix}-nombre`} label="Nombre artístico">
          <Input name="display_name" required maxLength={80} defaultValue={artist?.display_name ?? ""} />
        </Field>
        <Field id={`${prefix}-enlace`} label="Enlace" hint="Minúsculas, números y guiones.">
          <Input name="slug" required maxLength={60} defaultValue={artist?.slug ?? ""} />
        </Field>
        <Field id={`${prefix}-web`} label="Página oficial" optional hint="Empieza con https://">
          <Input name="link_url" maxLength={300} defaultValue={artist?.link_url ?? ""} />
        </Field>
      </div>
      <Field id={`${prefix}-historia`} label="Historia" optional hint="Entre 40 y 1200 caracteres.">
        <Textarea name="story" maxLength={1200} defaultValue={artist?.story ?? ""} className="min-h-20" />
      </Field>
      <Field id={`${prefix}-comprobacion`} label="Cómo comprobaste su identidad" hint="Queda en la auditoría, no es público. Por ejemplo: videollamada y mensaje desde su cuenta oficial.">
        <Input name="check" required minLength={10} maxLength={500} />
      </Field>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div><Button type="submit" loading={busy}>{artist ? (artist.revoked_at ? "Verificar de nuevo" : "Guardar cambios") : "Verificar artista"}</Button></div>
    </form>
  );
}

export function AdminArtistRevoke({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    setBusy(true);
    setMessage(null);
    const result = await postDiscovery("/api/admin/discovery", { action: "revoke_artist", userId, reason });
    setBusy(false);
    if (result.ok) router.refresh();
    else setMessage({ tone: "danger", text: result.message });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <Field id={`retirar-${userId.slice(0, 8)}`} label="Motivo para retirar la verificación">
        <Input name="reason" required minLength={3} maxLength={500} />
      </Field>
      <Button type="submit" variant="danger" loading={busy}>Retirar verificación</Button>
      {message ? <Notice tone={message.tone} className="md:col-span-2">{message.text}</Notice> : null}
    </form>
  );
}
