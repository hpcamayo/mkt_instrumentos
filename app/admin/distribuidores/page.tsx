import { AdminDealerRow } from "@/components/store-reach/admin-dealer-review";
import { ChipLink } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";
import { DEALER_STATUS_LABELS, parseDealerAuthorizations, type DealerStatus } from "@/lib/dealers";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Distribuidores" };

const FILTERS = ["pending", "approved", "rejected", "revoked", "withdrawn"] as const satisfies readonly DealerStatus[];

// reach-04 (docs/feature-ideas/store-reach.md): Admin review of the brand authorizations stores send.
export default async function AdminDealersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const [{ supabase }, query] = await Promise.all([requireAdmin("/admin/distribuidores"), searchParams]);
  const status = FILTERS.find((value) => value === query.estado) ?? "pending";
  const { data, error } = await storeReachDb(supabase).rpc("admin_get_dealer_authorizations", { p_status: status });
  const rows = error ? null : parseDealerAuthorizations(data);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Distribuidores"
        meta={(
          <p className="max-w-[68ch]">
            Aprueba solo si el documento es de la marca o de su representante en Perú y nombra a la tienda, su razón social o su RUC.
            La marca se ve en las publicaciones nuevas de la tienda mientras la autorización siga vigente.
          </p>
        )}
      />
      <nav aria-label="Estado de la autorización" className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <ChipLink key={value} href={`/admin/distribuidores?estado=${value}`} selected={value === status} current="page">
            {DEALER_STATUS_LABELS[value]}
          </ChipLink>
        ))}
      </nav>
      {rows === null ? (
        <Notice tone="danger">No pudimos cargar las autorizaciones. No asumiremos que no hay pendientes.</Notice>
      ) : rows.length ? (
        <ul className="grid gap-4">
          {rows.map((row) => <AdminDealerRow key={`${row.id}:${row.revision}`} row={row} />)}
        </ul>
      ) : (
        <EmptyState headingLevel={2} title="No hay autorizaciones en este estado" description="Cuando una tienda envíe una, aparecerá aquí." />
      )}
    </div>
  );
}
