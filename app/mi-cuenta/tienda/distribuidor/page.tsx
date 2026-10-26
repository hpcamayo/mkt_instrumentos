import { redirect } from "next/navigation";
import { DealerRequestForm, DealerStatusLine, DealerWithdrawButton } from "@/components/store-reach/dealer-requests";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parseDealerAuthorizations } from "@/lib/dealers";
import { storeReachDb } from "@/lib/store-reach-db";

export const metadata = { title: "Distribuidor oficial" };

// reach-04 (docs/feature-ideas/store-reach.md): the store's brand authorizations and the form to send one.
export default async function StoreDealerPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const { data, error } = await storeReachDb(supabase).rpc("get_store_dealer_authorizations");
  const rows = error ? null : parseDealerAuthorizations(data);
  const active = store.status === "active";

  return (
    <div className="space-y-6">
      <section className="rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          eyebrow="Mi tienda"
          title="Distribuidor oficial"
          meta={(
            <p>
              Si una marca te autorizó como distribuidor, envíanos el documento. Cuando Laria lo apruebe, tus publicaciones nuevas de esa marca
              muestran «Distribuidor oficial» y, en Instrumentos, quien filtre por la marca verá tu tienda entre sus distribuidores.
            </p>
          )}
        />
      </section>

      <section aria-labelledby="distribuidor-que-revisa" className="space-y-2 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
        <h2 id="distribuidor-que-revisa" className="t-section text-ink">Qué revisa Laria y qué no</h2>
        <ul className="list-disc space-y-2 pl-5 t-body text-ink">
          <li>Revisamos que el documento sea de la marca o de su representante en Perú y que nombre a tu tienda o a tu razón social.</li>
          <li>No revisamos cada instrumento. La garantía del fabricante la ofreces tú con la marca; Laria no la da ni la respalda.</li>
          <li>La marca se ve solo en publicaciones nuevas de tu tienda. Si la autorización vence o termina, retírala aquí o avísanos.</li>
        </ul>
      </section>

      <section aria-labelledby="distribuidor-enviar" className="space-y-4 rounded-panel border border-subtle bg-surface p-5 sm:p-6">
        <h2 id="distribuidor-enviar" className="t-section text-ink">Enviar una autorización</h2>
        {!active ? <Notice tone="info">Podrás enviarla cuando tu tienda esté activa.</Notice> : null}
        <DealerRequestForm disabled={!active} />
      </section>

      <section aria-labelledby="distribuidor-lista" className="space-y-3">
        <h2 id="distribuidor-lista" className="t-section text-ink">Tus autorizaciones</h2>
        {rows === null ? (
          <Notice tone="warning">No se pudieron cargar tus autorizaciones. Intenta nuevamente más tarde.</Notice>
        ) : rows.length ? (
          <ul className="grid gap-3">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-panel border border-subtle bg-surface p-4">
                <div className="min-w-0">
                  <p className="t-ui font-semibold text-ink">{row.brand}</p>
                  <DealerStatusLine authorization={row} />
                  <p className="t-meta text-ink-2">{row.documentName}</p>
                </div>
                {["awaiting_document", "pending", "approved"].includes(row.status) ? <DealerWithdrawButton authorization={row} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState headingLevel={3} title="Aún no enviaste autorizaciones" description="Cuando envíes una, verás aquí su estado." />
        )}
      </section>
    </div>
  );
}
