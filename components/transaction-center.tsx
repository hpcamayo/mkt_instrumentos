import Link from "next/link";
import type { TransactionCenterItem } from "@/lib/transactions";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusTag, Tag } from "@/components/ui/tag";

export function TransactionCenter({ items }: { items: TransactionCenterItem[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Aún no tienes compras o ventas vinculadas"
        description="Aquí aparecerán las solicitudes de confirmación y las transacciones que ambas partes reconozcan."
      />
    );
  }

  const pendingBuyer = items.filter((item) => item.role === "buyer" && item.status === "pending");
  const purchases = items.filter((item) => item.role === "buyer" && item.status !== "pending");
  const sales = items.filter((item) => item.role === "seller");
  return <div className="grid gap-6">
    {pendingBuyer.length ? <TransactionSection title="Requiere tu confirmación" description="Responde desde la relación exacta que indicó el vendedor." items={pendingBuyer} action /> : null}
    <TransactionSection title="Compras" description="Compras confirmadas, rechazadas o canceladas vinculadas a tu cuenta." items={purchases} />
    <TransactionSection title="Ventas" description="Ventas en las que pediste confirmación al comprador, como Particular o Tienda." items={sales} />
  </div>;
}

function TransactionSection({ title, description, items, action = false }: { title: string; description: string; items: TransactionCenterItem[]; action?: boolean }) {
  if (!items.length) return null;
  return <section className="grid gap-3" aria-labelledby={`transaction-${title.toLowerCase().replaceAll(" ", "-")}`}>
    <div><h2 id={`transaction-${title.toLowerCase().replaceAll(" ", "-")}`} className="t-section text-ink">{title}</h2><p className="mt-1 t-ui text-ink-2">{description}</p></div>
    <ol className="grid gap-3">
      {items.map((item) => (
        <li key={`${item.claim_id}-${item.reference_id}`} className={action ? "rounded-panel border border-subtle bg-warning-tint p-5" : "rounded-panel border border-subtle bg-white p-5"}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Tag tone="accent">{item.role === "buyer" ? "Compra" : "Venta"}</Tag>
                <StatusTag domain="claim" status={item.status} />
              </div>
              <h2 className="mt-3 t-section text-ink">{item.title}</h2>
              {action ? <p className="mt-2 font-semibold text-ink">¿Compraste este artículo?</p> : null}
              <p className="mt-1 t-ui text-ink-2">
                {item.role === "buyer" ? `Vendedor: ${item.seller_name}` : item.buyer_name ? `Contacto: ${item.buyer_name}` : "Sin comprador Laria asociado"}
              </p>
              {item.review_deadline ? (
                <p className="mt-2 t-meta font-semibold">
                  Reseñas hasta {formatDateTime(item.review_deadline)}
                  {item.own_review_submitted ? " · Tu reseña fue enviada" : ""}
                </p>
              ) : null}
              {item.status === "verified" && item.review_deadline && !item.own_review_submitted && new Date(item.review_deadline).getTime() > Date.now() ? <p className="mt-2 t-meta font-semibold text-ink">Tienes una reseña pendiente</p> : null}
            </div>
            <Link href={`/mi-cuenta/transacciones/${item.reference_id}`} className={buttonClasses({ variant: "secondary", className: "shrink-0" })}>
              {action ? "Responder" : "Ver detalle"}
            </Link>
          </div>
        </li>
      ))}
    </ol>
  </section>;
}

const dateTime = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function formatDateTime(value: string) {
  return dateTime.format(new Date(value));
}
