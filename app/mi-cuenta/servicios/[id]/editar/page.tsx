import Link from "next/link";
import { notFound } from "next/navigation";
import { ServiceForm } from "@/components/services/service-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { formatPhoneForDisplay } from "@/lib/phone";
import { SERVICE_CATEGORY_INFO, readOwnerService } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";

export const metadata = { title: "Editar servicio" };

type EditServicePageProps = { params: Promise<{ id: string }> };

// bet-02: edit one of the account's services. The kind stays; everything else can change.
export default async function EditServicePage({ params }: EditServicePageProps) {
  const [{ supabase, store }, { id }] = await Promise.all([getAccountContext(), params]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = supabase ? await servicesDb(supabase).rpc("get_my_service", { p_service_id: id }) : { data: null };
  const service = readOwnerService(data);
  if (!service) notFound();
  const info = SERVICE_CATEGORY_INFO[service.category];
  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta › Servicios"
        title="Editar servicio"
        meta={
          <p className="flex flex-wrap items-center gap-2">
            {info.label} <StatusTag domain="service" status={service.status} />
            {service.isPublic ? <Link href={service.path} className="link">Ver página</Link> : null}
          </p>
        }
      />
      {(service.status === "rejected" || service.status === "hidden") && service.moderationReason ? (
        <Notice tone={service.status === "rejected" ? "danger" : "warning"} title={service.status === "rejected" ? "Qué corregir" : "Por qué se ocultó"}>
          {service.moderationReason}
        </Notice>
      ) : null}
      <ServiceForm
        initial={{
          id: service.id,
          version: service.version,
          category: service.category,
          isStore: service.isStore,
          storeName: service.isStore ? store?.name ?? service.provider.name : null,
          status: service.status,
          values: {
            title: service.title,
            providerName: service.providerName,
            description: service.description,
            price: String(service.priceFrom),
            unit: service.priceUnit,
            modalities: service.modalities,
            skills: service.skills,
            city: service.city,
            region: service.region ?? "",
            district: service.district ?? "",
            areas: service.areas.join("\n"),
            whatsapp: formatPhoneForDisplay(service.whatsappPhone),
            photoPaths: service.photoPaths,
          },
        }}
      />
    </section>
  );
}
