"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { ALLOWANCE_NAME, allowanceLevel, type StoreAllowanceDetail } from "@/lib/store-allowance";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { cn } from "@/lib/utils";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const databaseMessage = (message: string | undefined, fallback: string) => /^[A-Z_]+: (.+)$/.exec(message ?? "")?.[1] ?? fallback;

// shop-05 (Effortless Laria, stores): the listing allowance as a meter with what uses it. At or near the limit it offers
// the two ways out: hide published listings that are out of stock (they hold a slot and sell nothing), or ask Admin
// for more. Hiding is an owner hide, so each listing comes back from Mis publicaciones or with its next restock.
export function StoreAllowanceMeter({ detail, inventoryEnabled }: { detail: StoreAllowanceDetail; inventoryEnabled: boolean }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [asking, setAsking] = useState(false);
  const [requested, setRequested] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const level = allowanceLevel(detail.used, detail.allowance);
  const percent = detail.allowance > 0 ? Math.min(100, Math.round((detail.used / detail.allowance) * 100)) : 100;
  const canHide = inventoryEnabled && detail.outOfStock > 0;

  async function hide() {
    if (!supabase || busy) return;
    const confirmed = await confirm({
      title: `¿Ocultar ${plural(detail.outOfStock, "publicación agotada", "publicaciones agotadas")}?`,
      body: "Dejan de verse y liberan cupo. Puedes volver a mostrarlas desde Mis publicaciones cuando repongas stock.",
      confirmLabel: "Ocultarlas",
    });
    if (!confirmed) return;
    setBusy(true);
    setError("");
    const { data, error: hideError } = await supabase.rpc("hide_out_of_stock_store_listings", { p_batch_key: `ocultar-agotadas-${crypto.randomUUID()}` });
    setBusy(false);
    if (hideError) {
      setError(databaseMessage(hideError.message, "No pudimos ocultarlas. Inténtalo otra vez."));
      return;
    }
    const hidden = Array.isArray((data as { hidden?: unknown[] } | null)?.hidden) ? (data as { hidden: unknown[] }).hidden.length : 0;
    setDone(hidden ? `Ocultaste ${plural(hidden, "publicación agotada", "publicaciones agotadas")}. Ese cupo ya está libre.` : "No quedaban publicaciones agotadas por ocultar.");
    router.refresh();
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const wanted = requested.trim() ? Number(requested) : null;
    if (wanted !== null && (!Number.isInteger(wanted) || wanted < 1 || wanted > 2000)) {
      setError("Indica un número entero entre 1 y 2000, o déjalo vacío.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: askError } = await supabase.rpc("request_store_admin_help", {
      p_kind: "listing_allowance", p_message: message.trim() || null, p_requested_allowance: wanted,
    });
    setBusy(false);
    if (askError) {
      setError(databaseMessage(askError.message, "No pudimos enviar la solicitud. Inténtalo otra vez."));
      return;
    }
    setAsking(false);
    setDone("Enviamos tu pedido al equipo de Laria. Te escribiremos al correo de la tienda.");
    router.refresh();
  }

  return (
    <section aria-labelledby="cupo-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cupo-titulo" className="font-semibold text-ink">{ALLOWANCE_NAME}</h2>
        <p className="t-ui text-ink-2"><span className="font-semibold text-ink">{detail.used}</span> de {detail.allowance} en uso</p>
      </div>
      <div
        role="meter"
        aria-label={ALLOWANCE_NAME}
        aria-valuemin={0}
        aria-valuemax={detail.allowance}
        aria-valuenow={Math.min(detail.used, detail.allowance)}
        aria-valuetext={`${detail.used} de ${detail.allowance} en uso`}
        className="h-2 overflow-hidden rounded-full bg-canvas"
      >
        <div
          className={cn("h-full rounded-full", level === "full" ? "bg-danger" : level === "near" ? "bg-ink-2" : "bg-accent")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="t-ui text-ink-2">
        Cuentan las publicaciones en revisión y las publicadas: {plural(detail.approved, "publicada", "publicadas")} y{" "}
        {plural(detail.pending, "en revisión", "en revisión")}. Las vendidas, ocultas o archivadas no ocupan cupo.
      </p>
      {canHide ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="t-ui text-ink">
            {plural(detail.outOfStock, "publicación agotada ocupa", "publicaciones agotadas ocupan")} cupo sin poder venderse.
          </p>
          <Button size="sm" variant="secondary" className="w-fit" loading={busy} loadingLabel="Ocultando…" onClick={() => void hide()}>
            Ocultarlas
          </Button>
        </div>
      ) : null}
      {detail.openRequest ? (
        <Notice tone="info" role="status">
          Pediste más cupo
          {detail.openRequest.requested_allowance ? ` (${detail.openRequest.requested_allowance} en total)` : ""} el{" "}
          {new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(new Date(detail.openRequest.created_at))}.
          El equipo de Laria lo está revisando.
        </Notice>
      ) : asking ? (
        <form onSubmit={ask} className="grid gap-3 rounded-panel border border-subtle bg-canvas p-4 sm:max-w-md">
          <Field id="cupo-pedido" label="¿Cuántas publicaciones necesitas en total? (opcional)" hint={`Hoy tienes ${detail.allowance}.`}>
            <Input type="number" inputMode="numeric" min={1} max={2000} value={requested} onChange={(event) => setRequested(event.target.value)} />
          </Field>
          <Field id="cupo-mensaje" label="Cuéntanos para qué (opcional)">
            <Textarea rows={3} maxLength={500} value={message} onChange={(event) => setMessage(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy} loadingLabel="Enviando…">Enviar pedido</Button>
            <Button size="sm" variant="quiet" onClick={() => { setAsking(false); setError(""); }}>Cancelar</Button>
          </div>
        </form>
      ) : level !== "ok" ? (
        <Button size="sm" variant={level === "full" ? "primary" : "secondary"} className="w-fit" onClick={() => { setAsking(true); setDone(""); }}>
          Pedir más cupo
        </Button>
      ) : (
        <button type="button" className="link w-fit t-ui" onClick={() => { setAsking(true); setDone(""); }}>Pedir más cupo</button>
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {done ? <Notice tone="success" role="status">{done}</Notice> : null}
      {dialog}
    </section>
  );
}
