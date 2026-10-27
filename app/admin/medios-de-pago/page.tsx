import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminInstallmentRow, type AdminInstallmentRow as InstallmentRow } from "@/components/payment/admin-installments-review";
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
  const [{ data, error }, installmentsResult] = await Promise.all([
    supabase.rpc("get_admin_store_payment_methods", { p_status: status, p_page: page, p_page_size: 24 }),
    // store-floor, buy-09: stores' interest-free installments, in the same state, on the first page only.
    page === 1 ? (supabase as unknown as SupabaseClient).rpc("get_admin_store_installment_offers", { p_status: status, p_page: 1, p_page_size: 50 }) : null,
  ]);
  const installments = installmentsResult && !installmentsResult.error && installmentsResult.data && typeof installmentsResult.data === "object"
    ? (installmentsResult.data as { items?: unknown; total?: unknown })
    : null;
  const installmentRows = (Array.isArray(installments?.items) ? installments.items : []).filter(
    (item): item is InstallmentRow => Boolean(item) && typeof item === "object" && typeof (item as InstallmentRow).store_id === "string",
  );
  const installmentTotal = typeof installments?.total === "number" ? installments.total : installmentRows.length;
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
      {installmentsResult ? (
        <section aria-labelledby="cuotas-titulo" className="grid gap-3">
          <h2 id="cuotas-titulo" className="t-section text-ink">Cuotas sin intereses</h2>
          <p className="max-w-[68ch] t-ui text-ink-2">
            Aprueba solo si el proveedor de tarjetas de la tienda ofrece esas cuotas sin intereses para el comprador. Se muestran mientras la tienda tenga un medio con tarjeta aprobado.
          </p>
          {installmentsResult.error || !installments ? (
            <Notice tone="danger">No pudimos cargar las cuotas. No asumiremos que no hay pendientes.</Notice>
          ) : installmentRows.length ? (
            <>
              <ul className="grid gap-4">
                {installmentRows.map((row) => <AdminInstallmentRow key={`${row.store_id}:${row.revision}`} row={row} />)}
              </ul>
              {installmentTotal > installmentRows.length ? <p className="t-meta">Se muestran las {installmentRows.length} más antiguas de {installmentTotal}.</p> : null}
            </>
          ) : (
            <p className="t-ui text-ink-2">No hay cuotas en este estado.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
