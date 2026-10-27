"use client";

import { useRouter } from "next/navigation";
import { useSellingRpc } from "@/components/offers/use-selling-rpc";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { isTradeCategory, type GearItem } from "@/lib/selling-tools";

// "Vender esto" opens the sell form with what the item already says (never a price); a second tap opens the same
// draft, or the listing once it is published. "Pedir ofertas a tiendas" is offered for the categories stores buy.
export function GearActions({ item, storesBuying }: { item: GearItem; storesBuying: number }) {
  const router = useRouter();
  const { run, busy, error } = useSellingRpc();
  const [confirm, confirmDialog] = useConfirm();

  async function sell() {
    const result = await run<{ draft_id?: string; listing_id?: string; status?: string }>(
      "start_gear_sale", { p_id: item.id }, "No pudimos abrir el formulario de venta. Inténtalo de nuevo.",
    );
    if (result?.draft_id) router.push(`/mi-cuenta/publicar?borrador=${result.draft_id}`);
    else if (result?.listing_id) router.push(`/mi-cuenta/publicaciones/${result.listing_id}/editar`);
  }

  async function remove() {
    if (!(await confirm({
      title: "¿Quitar este equipo de tu lista?",
      body: "Se borran sus datos, el número de serie y su recordatorio. Si lo estás vendiendo, la publicación no cambia.",
      confirmLabel: "Quitar de Mi equipo",
      tone: "danger",
    }))) return;
    const removed = await run<boolean>("delete_gear_item", { p_id: item.id }, "No pudimos quitar el equipo. Inténtalo de nuevo.");
    if (removed) {
      router.push("/mi-cuenta/equipo");
      router.refresh();
    }
  }

  return (
    <div className="grid gap-3">
      {confirmDialog}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={sell} loading={busy === "start_gear_sale"} loadingLabel="Abriendo">
          {item.sale_listing_id ? "Seguir con la venta" : "Vender esto"}
        </Button>
        {isTradeCategory(item.category) ? (
          <Button href={`/mi-cuenta/equipo/ofertas/nueva?equipo=${item.id}`} variant="secondary">
            Pedir ofertas a tiendas
          </Button>
        ) : null}
        <Button variant="danger" onClick={remove} loading={busy === "delete_gear_item"} loadingLabel="Quitando">
          Quitar de Mi equipo
        </Button>
      </div>
      {isTradeCategory(item.category) ? (
        <p className="t-meta">
          {storesBuying > 0
            ? `${storesBuying === 1 ? "Una tienda verificada de tu región compra" : `${storesBuying} tiendas verificadas de tu región compran`} equipos de esta categoría. Si prefieres vender ya, pídeles una oferta.`
            : "Todavía no hay tiendas verificadas de tu región que compren esta categoría; puedes publicarlo tú."}
        </p>
      ) : null}
    </div>
  );
}
