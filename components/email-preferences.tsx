"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageNotice } from "@/components/page-notice";
import { buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/field";
import { followLabel, type AccountFollow } from "@/lib/follows";

type Notice = { kind: "success" | "error"; message: string };

async function post(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message ?? "No pudimos guardar el cambio.");
  return result;
}

// save-07: "Correos". Each choice saves when it changes; nothing is pre-ticked beyond what the person already gets
// (price drops of their favorites), and the weekly digest starts off. save-12: what they follow, with one tap to stop.
export function EmailPreferences({ priceDrops, followDigest, activeAlerts, follows }: { priceDrops: boolean; followDigest: boolean; activeAlerts: number; follows: AccountFollow[] }) {
  const router = useRouter();
  const [choices, setChoices] = useState({ priceDrops, followDigest });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, confirmDialog] = useConfirm();

  async function save(next: typeof choices) {
    const previous = choices;
    setChoices(next);
    setNotice(null);
    try {
      await post("/api/email/preferences", next);
      setNotice({ kind: "success", message: "Guardado." });
    } catch (error) {
      setChoices(previous);
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "No pudimos guardar el cambio." });
    }
  }

  async function pauseAlerts() {
    if (!(await confirm({ title: "¿Pausar todas tus alertas?", body: "No recibirás correos de alertas hasta que las reactives una por una en Alertas.", confirmLabel: "Pausar alertas" }))) return;
    setBusy(true);
    try {
      const result = await post("/api/email/preferences", { action: "pause_alerts" });
      setNotice({ kind: "success", message: result.paused === 1 ? "Pausamos 1 alerta." : `Pausamos ${result.paused} alertas.` });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "No pudimos pausar tus alertas." });
    } finally {
      setBusy(false);
    }
  }

  async function unfollow(follow: AccountFollow) {
    try {
      await post("/api/follows", { ...(follow.store_id ? { storeId: follow.store_id } : { brand: follow.brand }), follow: false });
      setNotice({ kind: "success", message: `Dejaste de seguir ${followLabel(follow)}.` });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", message: error instanceof Error ? error.message : "No pudimos guardar el cambio." });
    }
  }

  return (
    <div className="grid gap-5">
      {confirmDialog}
      {notice ? <PageNotice kind={notice.kind} message={notice.message} /> : null}
      <section className="grid gap-3 rounded-panel border border-subtle bg-white p-5">
        <h2 className="t-section text-ink">Qué correos recibir</h2>
        <Checkbox
          checked={choices.priceDrops}
          onChange={(event) => void save({ ...choices, priceDrops: event.target.checked })}
          label="Bajas de precio de mis favoritos"
          description="Solo cuando baja 5% o más, y como máximo un aviso al día por publicación."
        />
        <Checkbox
          checked={choices.followDigest}
          onChange={(event) => void save({ ...choices, followDigest: event.target.checked })}
          label="Resumen semanal de lo que sigo"
          description="Los lunes, solo si hubo publicaciones nuevas en las tiendas y marcas que sigues."
        />
        <p className="t-meta">Los avisos sobre tus publicaciones, tu tienda y tus compras siempre llegan: son parte de usar tu cuenta.</p>
      </section>

      <section className="grid gap-3 rounded-panel border border-subtle bg-white p-5">
        <h2 className="t-section text-ink">Alertas de búsqueda</h2>
        <p className="t-ui text-ink-2">{activeAlerts === 0 ? "No tienes alertas activas." : activeAlerts === 1 ? "Tienes 1 alerta activa." : `Tienes ${activeAlerts} alertas activas.`} Cada correo de alerta trae un enlace para pausarla.</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/mi-cuenta/alertas" className={buttonClasses({ variant: "secondary" })}>Administrar alertas</Link>
          {activeAlerts > 0 ? <button type="button" disabled={busy} onClick={() => void pauseAlerts()} className={buttonClasses({ variant: "secondary" })}>Pausar todas</button> : null}
        </div>
      </section>

      <section id="sigues" className="grid gap-3 rounded-panel border border-subtle bg-white p-5">
        <h2 className="t-section text-ink">Lo que sigues</h2>
        {follows.length ? (
          <ul className="grid gap-2">
            {follows.map((follow) => (
              <li key={follow.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-2 last:border-b-0 last:pb-0">
                <span className="t-ui text-ink">
                  {follow.kind === "store" && follow.store_slug ? <Link href={`/tiendas/${follow.store_slug}`} className="link font-semibold">{followLabel(follow)}</Link> : <Link href={`/listados?brand=${encodeURIComponent(follow.brand ?? "")}`} className="link font-semibold">{followLabel(follow)}</Link>}
                  <span className="t-meta"> · {follow.kind === "store" ? "Tienda" : "Marca"}</span>
                </span>
                <button type="button" onClick={() => void unfollow(follow)} className={buttonClasses({ variant: "secondary", size: "sm" })}>Dejar de seguir</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-ui text-ink-2">Todavía no sigues tiendas ni marcas. Toca «Seguir» en una tienda o una marca para ver lo nuevo en Para ti.</p>
        )}
      </section>
    </div>
  );
}
