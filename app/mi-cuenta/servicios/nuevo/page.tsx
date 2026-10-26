import Link from "next/link";
import { redirect } from "next/navigation";
import { ServiceCategoryIcon } from "@/components/services/service-card";
import { ServiceForm } from "@/components/services/service-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { formatPhoneForDisplay } from "@/lib/phone";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_INFO, isServiceCategory, readOwnerServices } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";

export const metadata = { title: "Ofrecer un servicio" };

type NewServicePageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// bet-02: a new service. First the kind (one service per kind and account), then the form, filled with what the account
// already knows (name, WhatsApp, city), so only what is new is typed.
export default async function NewServicePage({ searchParams }: NewServicePageProps) {
  const [{ supabase, profile, store }, resolved] = await Promise.all([getAccountContext(), searchParams]);
  const tipo = Array.isArray(resolved.tipo) ? resolved.tipo[0] : resolved.tipo;
  const storeOwner = profile?.account_type === "store_owner";
  if (storeOwner && !store) {
    return (
      <section className="grid gap-5">
        <PageHeader eyebrow="Mi cuenta › Servicios" title="Ofrecer un servicio" />
        <Notice tone="info" title="Primero envía la solicitud de tu tienda">
          Tu tienda ofrece sus servicios con su nombre y su verificación. <Link href="/mi-cuenta/tienda" className="link">Ir a la solicitud de tienda</Link>
        </Notice>
      </section>
    );
  }
  const { data } = supabase ? await servicesDb(supabase).rpc("get_my_services") : { data: null };
  const mine = readOwnerServices(data);
  const taken = new Map(mine.map((service) => [service.category, service.id]));

  if (isServiceCategory(tipo) && taken.has(tipo)) redirect(`/mi-cuenta/servicios/${taken.get(tipo)}/editar`);

  if (!isServiceCategory(tipo)) {
    return (
      <section className="grid gap-5">
        <PageHeader
          eyebrow="Mi cuenta › Servicios"
          title="¿Qué servicio ofreces?"
          meta={<p className="max-w-3xl">Puedes ofrecer uno de cada tipo. Los servicios tienen su propia sección y no aparecen entre los instrumentos.</p>}
        />
        <ul className="grid gap-3 sm:grid-cols-2">
          {SERVICE_CATEGORIES.map((category) => {
            const info = SERVICE_CATEGORY_INFO[category];
            const existing = taken.get(category);
            return (
              <li key={category}>
                <Link
                  href={existing ? `/mi-cuenta/servicios/${existing}/editar` : `/mi-cuenta/servicios/nuevo?tipo=${category}`}
                  className="group flex h-full items-start gap-3 rounded-panel border border-subtle bg-surface p-4 transition-colors duration-120 hover:border-line-strong"
                >
                  <ServiceCategoryIcon category={category} className="mt-0.5 h-6 w-6 shrink-0" />
                  <span className="grid gap-1">
                    <span className="t-card-title text-ink decoration-accent decoration-2 underline-offset-[3px] group-hover:underline">{info.label}</span>
                    <span className="t-meta">{existing ? "Ya lo ofreces: editarlo" : info.blurb}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const info = SERVICE_CATEGORY_INFO[tipo];
  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta › Servicios"
        title={info.label}
        meta={<p className="max-w-3xl">{info.blurb} <Link href="/mi-cuenta/servicios/nuevo" className="link">Cambiar de tipo</Link></p>}
      />
      <ServiceForm
        initial={{
          id: null,
          version: null,
          category: tipo,
          isStore: Boolean(store),
          storeName: store?.name ?? null,
          status: null,
          values: {
            title: "",
            providerName: store ? store.name : profile?.full_name?.trim() ?? "",
            description: "",
            price: "",
            unit: info.units.length === 1 ? info.units[0] : "",
            modalities: [],
            skills: [],
            city: store?.city ?? profile?.city ?? "",
            region: store?.region ?? profile?.region ?? "",
            district: store?.district ?? "",
            areas: "",
            whatsapp: formatPhoneForDisplay(store?.whatsapp_phone ?? profile?.phone ?? ""),
            photoPaths: [],
          },
        }}
      />
    </section>
  );
}
