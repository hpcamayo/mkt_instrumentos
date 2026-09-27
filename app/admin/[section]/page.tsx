import { notFound } from "next/navigation";
import { AdminDomainView } from "@/components/admin-domain-view";
import {
  isAdminDomain,
  parseAdminDomainPayload,
  positivePage,
} from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-server";

type AdminDomainPageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{
    buscar?: string;
    estado?: string;
    pagina?: string;
    propietario?: string;
    tipo?: string;
    motivo?: string;
    cuenta?: string;
    pagina_cuentas?: string;
  }>;
};

export default async function AdminDomainPage({ params, searchParams }: AdminDomainPageProps) {
  const [{ section }, query, { supabase }] = await Promise.all([
    params,
    searchParams,
    requireAdmin(),
  ]);
  if (!isAdminDomain(section)) notFound();

  const search = query.buscar?.trim().slice(0, 100) ?? "";
  const status = query.estado?.trim().slice(0, 40) ?? "";
  const ownerType = query.propietario?.trim().slice(0, 40) ?? "";
  const targetType = query.tipo?.trim().slice(0, 40) ?? "";
  const reason = query.motivo?.trim().slice(0, 40) ?? "";
  const userSearch = query.cuenta?.trim().slice(0, 100) ?? "";
  const page = positivePage(query.pagina);
  const userPage = positivePage(query.pagina_cuentas);
  const response = section === "publicaciones"
    ? await supabase.rpc("get_admin_listings_page", {
        p_status: status,
        p_owner_type: ownerType,
        p_search: search,
        p_page: page,
        p_page_size: 24,
      })
    : section === "reportes"
      ? await supabase.rpc("get_admin_reports_page", {
          p_status: status,
          p_target_type: targetType,
          p_reason: reason,
          p_search: search,
          p_page: page,
          p_page_size: 24,
        })
      : section === "legacy"
        ? await supabase.rpc("get_admin_legacy_page", {
            p_listing_search: search,
            p_user_search: userSearch,
            p_listing_page: page,
            p_user_page: userPage,
            p_page_size: 20,
          })
        : await supabase.rpc("get_admin_domain_page", {
            p_domain: section,
            p_search: search,
            p_status: status,
            p_page: page,
            p_page_size: 24,
          });
  const { data, error } = response;
  const payload = parseAdminDomainPayload(data);

  return (
    <AdminDomainView
      domain={section}
      payload={payload}
      search={search}
      status={status}
      ownerType={ownerType}
      targetType={targetType}
      reason={reason}
      userSearch={userSearch}
      userPage={userPage}
      loadError={error || !payload ? "No pudimos cargar esta sección administrativa. No asumiremos que está vacía." : null}
    />
  );
}
