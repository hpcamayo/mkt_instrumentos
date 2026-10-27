"use client";

import { useRouter } from "next/navigation";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button, buttonClasses } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { buildWhatsAppHref } from "@/lib/phone";

// The owner's side of a consignment in Mi equipo: talk to the store, or end it (the store is told and decides what
// happens to its listing).
export function ConsignmentOwnerActions({ consignmentId, storeName, storePhone, listingTitle }: { consignmentId: string; storeName: string; storePhone: string | null; listingTitle: string }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [confirm, confirmDialog] = useConfirm();

  async function end() {
    if (!(await confirm({
      title: "¿Terminar la consignación?",
      body: `Le avisaremos a ${storeName}. Dejarás de ver las visitas y contactos; recoger tu equipo lo coordinas con la tienda.`,
      confirmLabel: "Terminar consignación",
      tone: "danger",
    }))) return;
    if (await run("end_consignment", { p_consignment_id: consignmentId }, "No pudimos terminar la consignación. Inténtalo de nuevo.")) router.refresh();
  }

  return (
    <div className="grid gap-2">
      {confirmDialog}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        {storePhone ? (
          <a
            href={buildWhatsAppHref(storePhone, `Hola, te escribo por mi ${listingTitle} en consignación.`)}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ variant: "secondary", size: "sm" })}
          >
            <WhatsAppGlyph />
            Contactar por WhatsApp
          </a>
        ) : null}
        <Button variant="quiet" size="sm" onClick={end} loading={busy === "end_consignment"} loadingLabel="Terminando">Terminar consignación</Button>
      </div>
    </div>
  );
}
