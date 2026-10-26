"use client";

import Link from "next/link";
import { BellRing, Pencil, Tag as TagIcon, TrendingDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useMarketplaceAccount } from "@/components/marketplace-account-provider";
import { buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

type Viewer = { authenticated: boolean; owner: boolean; stockManaged: boolean; watching: boolean };

// One request per listing and page load, shared by the owner bar and the availability buttons.
const viewers = new Map<string, Promise<Viewer | null>>();
function loadViewer(listingId: string) {
  let pending = viewers.get(listingId);
  if (!pending) {
    pending = fetch("/api/listing-viewer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId }) })
      .then((response) => (response.ok ? (response.json() as Promise<Viewer>) : null))
      .catch(() => null);
    viewers.set(listingId, pending);
  }
  return pending;
}

function useViewer(listingId: string) {
  const account = useMarketplaceAccount();
  const [viewer, setViewer] = useState<Viewer | null>(null);
  useEffect(() => {
    if (!account.ready || !account.authenticated) return;
    let active = true;
    void loadViewer(listingId).then((value) => { if (active) setViewer(value); });
    return () => { active = false; };
  }, [account.ready, account.authenticated, listingId]);
  return account.ready && account.authenticated ? viewer : null;
}

// The owner's shortcuts on their own public listing (mine-05): Editar · Bajar precio · Marcar vendida · Compartir.
// Shown only to the owner, after the page loads; visitors never see it. A listing whose stock Inventario controls
// offers "Ver en Inventario" instead of "Marcar vendida" (D-15). `share` is the page's share control.
export function OwnerBar({ listingId, sold, share, className }: { listingId: string; sold: boolean; share?: ReactNode; className?: string }) {
  const viewer = useViewer(listingId);
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!viewer?.owner) return null;
  const edit = `/mi-cuenta/publicaciones/${listingId}/editar`;

  async function markSold() {
    if (!(await confirm({ title: "¿Marcar esta publicación como vendida?", body: "La publicación original quedará bloqueada como historial.", confirmLabel: "Marcar vendida" }))) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/listings/${listingId}/manage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sold" }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage(result?.message ?? "No se pudo marcar como vendida.");
      return;
    }
    router.push(`/mi-cuenta/transacciones/${listingId}`);
  }

  return (
    <section aria-label="Tu publicación" className={cn("rounded-panel border border-line-strong bg-canvas p-3", className)}>
      {confirmDialog}
      <p className="t-meta font-semibold text-ink">Es tu publicación</p>
      {sold ? (
        <p className="mt-1 t-meta">Está vendida: puedes republicar una copia desde Mis publicaciones.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={edit} className={buttonClasses({ variant: "secondary", size: "sm" })}><Pencil aria-hidden />Editar</Link>
          <Link href={`${edit}#editar-price_pen`} className={buttonClasses({ variant: "secondary", size: "sm" })}><TrendingDown aria-hidden />Bajar precio</Link>
          {viewer.stockManaged ? (
            <Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary", size: "sm" })}>Ver en Inventario</Link>
          ) : (
            <button type="button" disabled={busy} aria-busy={busy} onClick={() => void markSold()} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <TagIcon aria-hidden />Marcar vendida
            </button>
          )}
          {share}
        </div>
      )}
      {message ? <p role="alert" className="mt-2 t-meta font-semibold text-danger">{message}</p> : null}
    </section>
  );
}

// "Avísame cuando vuelva" on an Agotado listing (list-11): one notice, in the app and by e-mail, when it has units
// again; then the request ends. Visitors get a sign-in link that comes back here.
// store-floor (reach-08): `arriving` when the store gave a date ("Por llegar"); the same watch, worded for an arrival.
export function RestockAlert({ listingId, className, arriving = false }: { listingId: string; className?: string; arriving?: boolean }) {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  const viewer = useViewer(listingId);
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const current = watching ?? viewer?.watching ?? false;
  if (!account.ready) return null;
  if (viewer?.owner) return null;
  if (!account.authenticated) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClasses({ variant: "secondary", className })}>
        <BellRing aria-hidden />Ingresa para que te avisemos
      </Link>
    );
  }

  async function toggle() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/listing-viewer", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, watch: !current }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage(result?.message ?? "No pudimos guardar el aviso. Intenta de nuevo.");
      return;
    }
    setWatching(result.watching === true);
    viewers.delete(listingId);
  }

  return (
    <div className={cn("grid gap-1", className)}>
      <button type="button" aria-pressed={current} disabled={busy} aria-busy={busy} onClick={() => void toggle()} className={buttonClasses({ variant: "secondary" })}>
        <BellRing aria-hidden />{current ? "Te avisaremos · Cancelar aviso" : arriving ? "Avísame cuando llegue" : "Avísame cuando vuelva"}
      </button>
      <p role="status" className="t-meta">{message ?? (current ? `Te escribiremos una vez cuando ${arriving ? "llegue" : "vuelva a estar disponible"}.` : "")}</p>
    </div>
  );
}

// "Avísame si aparece otro" on a Vendido listing (list-11): a ready search alert for the same brand and type, sent as
// soon as a matching listing is published. Managed and removed in Alertas like any other.
export function SimilarAlert({ filters, className }: { filters: { category: string; instrument_type?: string; brand?: string }; className?: string }) {
  const account = useMarketplaceAccount();
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  if (!account.ready) return null;
  if (!account.authenticated) {
    return (
      <Link href={`/login?next=${encodeURIComponent(pathname)}`} className={buttonClasses({ variant: "secondary", className })}>
        <BellRing aria-hidden />Ingresa para que te avisemos si aparece otro
      </Link>
    );
  }

  async function create() {
    setState("busy");
    const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", filters, frequency: "immediate" }) }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (response?.ok || response?.status === 409) {
      setState("done");
      setMessage(response.status === 409 ? "Ya tienes esta alerta. Puedes verla en Alertas." : "Listo: te avisaremos cuando se publique uno parecido.");
      return;
    }
    setState("error");
    setMessage(result?.message ?? "No pudimos crear la alerta. Intenta de nuevo.");
  }

  return (
    <div className={cn("grid gap-1", className)}>
      {state === "done" ? (
        <Link href="/mi-cuenta/alertas" className={buttonClasses({ variant: "secondary" })}>Ver mis alertas</Link>
      ) : (
        <button type="button" disabled={state === "busy"} aria-busy={state === "busy"} onClick={() => void create()} className={buttonClasses({ variant: "secondary" })}>
          <BellRing aria-hidden />Avísame si aparece otro
        </button>
      )}
      <p role="status" className={state === "error" ? "t-meta font-semibold text-danger" : "t-meta"}>{message}</p>
    </div>
  );
}
