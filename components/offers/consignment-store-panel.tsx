"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { Tag } from "@/components/ui/tag";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { consignmentInviteMessage, consignmentInvitePath, consignmentStatusLabel, formatLimaDateTime, type StoreListingConsignment } from "@/lib/selling-tools";

// sell-03, the store's side: invite the owner with a one-time link (shown once, sent by WhatsApp or copied), see when
// they linked, or end it.
export function ConsignmentStorePanel({ listingId, listingTitle, storeName, consignment, enabled }: {
  listingId: string;
  listingTitle: string;
  storeName: string;
  consignment: StoreListingConsignment | null;
  enabled: boolean;
}) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [confirm, confirmDialog] = useConfirm();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const open = consignment && (consignment.status === "invited" || consignment.status === "active") ? consignment : null;

  async function invite() {
    const result = await run<{ token: string }>("create_consignment_invite", { p_listing_id: listingId }, "No pudimos crear el enlace. Inténtalo de nuevo.");
    if (result?.token) {
      setLink(new URL(consignmentInvitePath(result.token), window.location.origin).toString());
      setCopied(false);
      router.refresh();
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function end() {
    if (!open) return;
    if (!(await confirm({ title: "¿Terminar la consignación?", body: "Le avisaremos a la persona dueña. La publicación sigue como está: decide tú si ocultarla.", confirmLabel: "Terminar consignación", tone: "danger" }))) return;
    if (await run("end_consignment", { p_consignment_id: open.id }, "No pudimos terminar la consignación. Inténtalo de nuevo.")) router.refresh();
  }

  return (
    <section aria-labelledby="consignacion" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
      {confirmDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consignacion" className="t-section text-ink">Consignación</h2>
        {open ? <Tag tone={open.status === "active" ? "accent" : "neutral"}>{consignmentStatusLabel(open.status)}</Tag> : null}
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!enabled ? (
        <p className="t-ui text-ink-2">Activa «Recibimos en consignación» en <Link href="/mi-cuenta/tienda/ofertas/ajustes" className="link">Qué recibimos</Link> (tiendas verificadas).</p>
      ) : open?.status === "active" ? (
        <>
          <p className="t-body text-ink">{open.owner_name ?? "La persona dueña"} sigue esta publicación desde su cuenta. Se lee «En consignación en {storeName}».</p>
          <Button variant="quiet" className="w-fit" onClick={end} loading={busy === "end_consignment"} loadingLabel="Terminando">Terminar consignación</Button>
        </>
      ) : (
        <>
          <p className="t-ui text-ink-2">
            Si este equipo es de un particular, envíale un enlace para que lo vincule a su cuenta: verá visitas, contactos y guardados, y le avisaremos cuando lo marques vendido. La comisión la acuerdan ustedes.
          </p>
          {open?.status === "invited" && !link ? (
            <p className="t-meta">Hay un enlace enviado que vence el {open.invite_expires_at ? formatLimaDateTime(open.invite_expires_at) : "pronto"}. Si se perdió, crea uno nuevo: el anterior deja de funcionar.</p>
          ) : null}
          {link ? (
            <div className="grid gap-2 rounded-control bg-canvas p-3">
              <p className="t-ui text-ink">Enlace listo. Solo se muestra esta vez y vence en 7 días.</p>
              <p className="break-all t-meta">{link}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(consignmentInviteMessage(storeName, listingTitle, link))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  <WhatsAppGlyph />
                  Enviar por WhatsApp
                </a>
                <Button variant="quiet" size="sm" onClick={copy}>{copied ? "Copiado" : "Copiar enlace"}</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="w-fit" onClick={invite} loading={busy === "create_consignment_invite"} loadingLabel="Creando">
              {open?.status === "invited" ? "Crear un enlace nuevo" : "Invitar a la persona dueña"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
