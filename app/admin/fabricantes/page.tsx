import { AdminMakerRow, type AdminMaker } from "@/components/discovery/admin-discovery-rows";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/admin-server";

export const metadata = { title: "Fabricantes y talleres" };

// disc-04 Admin (docs/feature-ideas/discovery.md): every store that declared itself Fabricante or Taller, hidden ones
// included, with a way to hide or show it again.
export default async function AdminMakersPage() {
  const { supabase } = await requireAdmin("/admin/fabricantes");
  const { data, error } = await (supabase as unknown as { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("get_admin_makers");
  const makers = Array.isArray(data) ? (data as AdminMaker[]) : [];
  return (
    <div className="grid gap-5">
      <PageHeader title="Fabricantes y talleres" meta={<p className="max-w-[68ch]">Cada tienda declara si fabrica o hace a mano sus instrumentos. Laria no lo verifica: oculta el perfil si un reporte o una revisión muestra que no es cierto.</p>} />
      {error ? (
        <Notice tone="danger">No pudimos cargar los perfiles. No asumiremos que no hay ninguno.</Notice>
      ) : makers.length ? (
        <ul className="grid gap-4">{makers.map((maker) => <AdminMakerRow key={maker.store_id} maker={maker} />)}</ul>
      ) : (
        <EmptyState headingLevel={2} title="Ninguna tienda se marcó como fabricante o taller" description="Cuando una tienda lo haga desde Mi tienda, aparecerá aquí." />
      )}
    </div>
  );
}
