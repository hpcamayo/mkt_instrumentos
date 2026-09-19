import Link from "next/link";
import { transactionStateLabel, type TransactionCenterItem } from "@/lib/transactions";

export function TransactionCenter({ items }: { items: TransactionCenterItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-laria-fog bg-white p-8 text-center shadow-sm">
        <h2 className="text-lg font-black text-laria-ink">Aún no tienes compras o ventas vinculadas</h2>
        <p className="mt-2 text-sm leading-6 text-laria-text-soft">
          Aquí aparecerán las solicitudes de confirmación y las transacciones que ambas partes reconozcan.
        </p>
      </div>
    );
  }

  return (
    <ol className="grid gap-3">
      {items.map((item) => (
        <li key={`${item.claim_id}-${item.reference_id}`} className="rounded-lg border border-laria-fog bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-laria-blue/10 px-2.5 py-1 text-xs font-black text-laria-blue">
                  {item.role === "buyer" ? "Compra" : "Venta"}
                </span>
                <span className="text-xs font-bold text-laria-text-soft">{transactionStateLabel(item.status)}</span>
              </div>
              <h2 className="mt-3 text-lg font-black text-laria-ink">{item.title}</h2>
              <p className="mt-1 text-sm text-laria-text-soft">
                {item.role === "buyer" ? `Vendedor: ${item.seller_name}` : item.buyer_name ? `Contacto: ${item.buyer_name}` : "Sin comprador Laria asociado"}
              </p>
              {item.review_deadline ? (
                <p className="mt-2 text-xs font-semibold text-laria-muted">
                  Reseñas hasta {formatDateTime(item.review_deadline)}
                  {item.own_review_submitted ? " · Tu reseña fue enviada" : ""}
                </p>
              ) : null}
            </div>
            <Link href={`/mi-cuenta/transacciones/${item.reference_id}`} className="laria-button-secondary min-h-11 shrink-0 px-4 py-3 text-sm">
              Ver detalle
            </Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

const dateTime = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});

function formatDateTime(value: string) {
  return dateTime.format(new Date(value));
}
