import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ContentReport } from "@/components/content-report";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { PageContainer } from "@/components/page-container";
import { SellerAvatar, SellerKindMark } from "@/components/listing/seller-card";
import { ServiceCategoryIcon } from "@/components/services/service-card";
import { ServiceViewRecorder, ServiceWhatsAppLink } from "@/components/services/service-contact";
import { ServiceHirePanel } from "@/components/services/service-hire-panel";
import { MoreServiceReviews, ServiceReviewCard } from "@/components/services/service-reviews";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { StatusTag } from "@/components/ui/tag";
import { WhatsAppGlyph } from "@/components/ui/whatsapp-glyph";
import { formatMonthYear } from "@/lib/listing-page";
import { buildWhatsAppHref } from "@/lib/phone";
import {
  SERVICE_CATEGORY_INFO,
  SERVICES_PATH,
  formatServicePrice,
  readServiceDetail,
  serviceCategoryFromSlug,
  serviceCategoryPath,
  serviceContactMessage,
  serviceModalityLabel,
  servicePhotoUrl,
  servicePlaceLine,
  serviceRatingLabel,
  serviceSkillLabel,
  type ServiceCategory,
  type ServiceDetail,
} from "@/lib/services";
import { buildServiceMetadata } from "@/lib/services-metadata";
import { servicesDb } from "@/lib/services-db";
import { getRequestReads } from "@/lib/supabase/public-read-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type ServicePageProps = { params: Promise<{ categoria: string; slug: string }> };

// The public read first; when the service is not public, the signed-in owner or Admin may still see it as a preview.
const loadService = cache(async (category: ServiceCategory, slug: string): Promise<ServiceDetail | null> => {
  const { supabase } = getRequestReads();
  if (supabase) {
    const { data, error } = await servicesDb(supabase).rpc("get_public_service", { p_category: category, p_slug: slug });
    if (error) throw new Error(`Service read failed: ${error.message}`);
    const service = readServiceDetail(data);
    if (service) return service;
  }
  const signedIn = await getSupabaseServerClient();
  if (!signedIn) return null;
  const { data: auth } = await signedIn.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await servicesDb(signedIn).rpc("get_public_service", { p_category: category, p_slug: slug });
  return readServiceDetail(data);
});

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const { categoria, slug } = await params;
  const category = serviceCategoryFromSlug(categoria);
  const service = category ? await loadService(category, slug) : null;
  return service ? buildServiceMetadata(service) : { title: "Servicio no disponible" };
}

// bet-02 (docs/feature-ideas/services.md): one service for musicians. Who offers it, from what price, where and how,
// what they teach or repair, the photos, the WhatsApp button, reviews from confirmed clients and "¿Contrataste este
// servicio?". Never an instrument page: no favorites, no stock, no catalog links.
export default async function ServicePage({ params }: ServicePageProps) {
  const { categoria, slug } = await params;
  const category = serviceCategoryFromSlug(categoria);
  if (!category) notFound();
  const service = await loadService(category, slug);
  if (!service) notFound();

  const info = SERVICE_CATEGORY_INFO[service.category];
  const place = servicePlaceLine(service);
  const rating = serviceRatingLabel(service.rating);
  const since = formatMonthYear(service.provider.since);
  const photos = service.photoPaths.map((path) => servicePhotoUrl(path)).filter((url): url is string => Boolean(url));
  const whatsapp = buildWhatsAppHref(service.whatsappPhone, serviceContactMessage(service));
  const skillsLabel = service.category === "clases" ? "Enseña" : "Repara";

  return (
    <article className="bg-surface">
      <PageContainer className="py-6 lg:py-8">
        <Breadcrumbs
          items={[
            { label: "Inicio", href: "/" },
            { label: "Servicios para músicos", href: SERVICES_PATH },
            { label: info.label, href: serviceCategoryPath(service.category) },
            { label: service.title },
          ]}
          phoneBackLink
          className="mb-3"
        />
        {service.preview ? (
          <Notice tone="warning" title={service.isOwner ? "Vista previa: solo tú y moderación ven esta página" : "Vista previa de moderación"} className="mb-5">
            <span className="inline-flex flex-wrap items-center gap-2">
              Estado: <StatusTag domain="service" status={service.status} />
            </span>
          </Notice>
        ) : null}
        <ServiceViewRecorder serviceId={service.id} enabled={!service.preview && !service.isOwner} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
          <div className="grid min-w-0 content-start gap-6">
            <header className="grid gap-2">
              <p className="t-micro text-ink-2">{info.label}</p>
              <h1 className="break-words t-page text-ink">{service.title}</h1>
              <p className="t-ui font-semibold tabular-nums text-ink">{formatServicePrice(service.priceFrom, service.priceUnit)}</p>
              {place ? <p className="t-meta">{place}</p> : null}
              {rating ? <p className="t-meta text-ink"><a href="#resenas" className="link">{rating}</a></p> : null}
            </header>

            {photos.length ? (
              <div className="grid gap-2">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-panel bg-canvas">
                  <Image src={photos[0]} alt={`Foto de ${service.title}`} fill priority sizes="(max-width: 1023px) 100vw, 700px" className="object-cover" />
                </div>
                {photos.length > 1 ? (
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {photos.slice(1).map((url, index) => (
                      <li key={url} className="relative aspect-square overflow-hidden rounded-control bg-canvas">
                        <Image src={url} alt={`Foto ${index + 2} de ${service.title}`} fill sizes="(max-width: 639px) 33vw, 140px" className="object-cover" />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <div className="flex aspect-[3/1] w-full items-center justify-center rounded-panel bg-canvas">
                <ServiceCategoryIcon category={service.category} className="h-10 w-10" />
              </div>
            )}

            <section aria-labelledby="detalles" className="grid gap-3">
              <h2 id="detalles" className="t-section text-ink">Detalles</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="t-meta">Dónde</dt>
                  <dd className="t-ui text-ink">{service.modalities.map((modality) => serviceModalityLabel(modality, service.category)).join(" · ")}</dd>
                </div>
                <div>
                  <dt className="t-meta">Precio</dt>
                  <dd className="t-ui text-ink tabular-nums">{formatServicePrice(service.priceFrom, service.priceUnit)}. El precio final lo acuerdas con quien ofrece el servicio.</dd>
                </div>
                {service.skills.length ? (
                  <div className="sm:col-span-2">
                    <dt className="t-meta">{skillsLabel}</dt>
                    <dd className="t-ui text-ink">{service.skills.map(serviceSkillLabel).join(" · ")}</dd>
                  </div>
                ) : null}
                {service.areas.length ? (
                  <div className="sm:col-span-2">
                    <dt className="t-meta">Zonas que atiende</dt>
                    <dd className="t-ui text-ink">{service.areas.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section aria-labelledby="descripcion" className="grid gap-2">
              <h2 id="descripcion" className="t-section text-ink">Sobre el servicio</h2>
              <p className="max-w-[68ch] whitespace-pre-line t-body text-ink-2">{service.description}</p>
            </section>

            <section aria-labelledby="resenas-titulo" id="resenas" className="grid scroll-mt-4 gap-3">
              <h2 id="resenas-titulo" className="t-section text-ink">Reseñas</h2>
              {service.rating.count ? (
                <>
                  <p className="t-ui text-ink">{rating}</p>
                  <ul className="grid max-w-sm gap-1" aria-label="Reseñas por estrellas">
                    {([5, 4, 3, 2, 1] as const).map((stars) => (
                      <li key={stars} className="grid grid-cols-[72px_1fr_32px] items-center gap-2 t-meta">
                        <span>{stars} {stars === 1 ? "estrella" : "estrellas"}</span>
                        <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-subtle">
                          <span className="block h-full bg-ink" style={{ width: `${Math.round((service.breakdown[stars] / service.rating.count) * 100)}%` }} />
                        </span>
                        <span className="text-right tabular-nums text-ink">{service.breakdown[stars]}</span>
                      </li>
                    ))}
                  </ul>
                  <ol className="grid gap-3">
                    {service.reviews.map((review) => <ServiceReviewCard key={review.id} review={review} />)}
                  </ol>
                  <MoreServiceReviews serviceId={service.id} shown={service.reviews.length} total={service.rating.count} />
                </>
              ) : (
                <p className="t-ui text-ink-2">Aún no tiene reseñas. Solo reseñan clientes que confirmaron la contratación con quien ofrece el servicio.</p>
              )}
            </section>

            {service.otherServices.length ? (
              <section aria-labelledby="otros" className="grid gap-2">
                <h2 id="otros" className="t-section text-ink">Otros servicios de {service.provider.name}</h2>
                <ul className="grid gap-2">
                  {service.otherServices.map((other) => (
                    <li key={other.id}>
                      <Link href={other.path} className="link inline-flex min-h-6 items-center t-ui font-semibold">{other.title}</Link>
                      <span className="t-meta"> · {SERVICE_CATEGORY_INFO[other.category].label} · {formatServicePrice(other.priceFrom, other.priceUnit)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="grid content-start gap-4">
            <section aria-labelledby="proveedor" className="grid gap-3 rounded-panel border border-subtle p-4">
              <h2 id="proveedor" className="sr-only">Quién ofrece el servicio</h2>
              <div className="flex items-center gap-3">
                <SellerAvatar seller={{ name: service.provider.name, kind: service.provider.kind, logoUrl: service.provider.logoUrl }} size={64} />
                <div className="grid min-w-0 gap-1">
                  {service.provider.storeSlug ? (
                    <Link href={`/tiendas/${service.provider.storeSlug}`} className="link break-words t-card-title">{service.provider.name}</Link>
                  ) : (
                    <p className="break-words t-card-title text-ink">{service.provider.name}</p>
                  )}
                  <span><SellerKindMark kind={service.provider.kind} /></span>
                  {since ? <p className="t-meta">En Laria desde {since}</p> : null}
                </div>
              </div>
              {service.preview ? null : (
                <ServiceWhatsAppLink href={whatsapp} serviceId={service.id} className={buttonClasses({ size: "lg", block: true })}>
                  <WhatsAppGlyph />
                  Contactar por WhatsApp
                </ServiceWhatsAppLink>
              )}
              <p className="t-meta">
                Acuerda el precio, el horario y el pago directamente con quien ofrece el servicio. Laria no cobra, no recibe
                pagos y no verifica títulos, experiencia ni la calidad del trabajo.
              </p>
            </section>
            {service.preview ? null : <ServiceHirePanel serviceId={service.id} providerName={service.provider.name} />}
            {service.preview || service.isOwner ? null : (
              <div className="px-1">
                <ContentReport targetType="service" targetId={service.id} label="Reportar servicio" icon />
              </div>
            )}
          </aside>
        </div>
      </PageContainer>
    </article>
  );
}
