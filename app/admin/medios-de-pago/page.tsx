import { AdminPaymentMethodRow, type AdminPaymentMethodRow as Row } from "@/components/payment/admin-payment-methods-review";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { positivePage } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-server";
import { isPaymentMethod } from "@/lib/payment-methods";
import { statusLabel } from "@/lib/ui/status";

export const metadata = { title: "Medios de pago" };

const FILTERS = ["pending_review", "approved", "rejected", "disabled", "withdrawn"] as const;

// PAY-1: Admin review of the payment methods verified stores declare (docs/store-operations/pay-1.md).
export default async function AdminPaymentMethodsPage({ searchParams }: { searchParams: Promise<{ estado?: string; pagina?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/medios-de-pago"), searchParams]);
  const status = FILTERS.find((value) => value === query.estado) ?? "pending_review";
  const page = positivePage(query.pagina);
  const { data, error } = await supabase.rpc("get_admin_store_payment_methods", { p_status: status, p_page: page, p_page_size: 24 });
  const payload = data && typeof data === "object" && !Array.isArray(data) ? (data as { items?: unknown; total?: unknown }) : null;
  const rows = (Array.isArray(payload?.items) ? payload.items : []).filter(
    (item): item is Row => Boolean(item) && typeof item === "object" && isPaymentMethod((item as Row).method),
  );
  const total = typeof payload?.total === "number" ? payload.total : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Medios de pago"
        meta={<p className="max-w-[68ch]">Aprueba un medio solo si el titular coincide con la razón social o el RUC de la tienda verificada. Los compradores ven los medios aprobados mientras la tienda siga verificada.</p>}
      />
      <nav aria-label="Estado del medio de pago" className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <ChipLink key={value} href={`/admin/medios-de-pago?estado=${value}`} selected={value === status} current="page">
            {statusLabel("payment", value)}
          </ChipLink>
        ))}
      </nav>
      {error || !payload ? (
        <Notice tone="danger">No pudimos cargar los medios de pago. No asumiremos que no hay pendientes.</Notice>
      ) : rows.length ? (
        <ul className="grid gap-4">
          {rows.map((row) => <AdminPaymentMethodRow key={`${row.store_id}:${row.method}:${row.revision}`} row={row} />)}
        </ul>
      ) : (
        <EmptyState headingLevel={2} title="No hay medios de pago en este estado" description={total === 0 ? "Cuando una tienda verificada indique un medio, aparecerá aquí." : "Prueba con otro estado."} />
      )}
    </div>
  );
}
