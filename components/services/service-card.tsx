import Link from "next/link";
import { BookOpen, Mic, Music2, Speaker, Wrench } from "lucide-react";
import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { SellerKindMark } from "@/components/listing/seller-card";
import {
  formatServicePrice,
  serviceCategoryLabel,
  serviceModalityLabel,
  servicePhotoUrl,
  servicePlaceLine,
  serviceRatingLabel,
  type ServiceCard as ServiceCardData,
  type ServiceCategory,
} from "@/lib/services";
import { cn } from "@/lib/utils";

// bet-02: the category's mark where a service has no photo (a quiet tile, never a stock image of someone else's work).
export function ServiceCategoryIcon({ category, className }: { category: ServiceCategory; className?: string }) {
  const Icon = category === "clases" ? BookOpen : category === "reparaciones" ? Wrench : category === "ensayo" ? Music2 : category === "grabacion" ? Mic : Speaker;
  return <Icon aria-hidden="true" className={cn("h-8 w-8 text-ink-2", className)} />;
}

// One service in the directory: photo or the category's mark, title, who offers it, the starting price, where and how,
// and the rating from confirmed clients when there is one. The whole card is one link to the service page. Real
// figures only.
export function ServiceCard({ service, headingLevel = 2, eager = false }: { service: ServiceCardData; headingLevel?: 2 | 3; eager?: boolean }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const cover = servicePhotoUrl(service.coverPath);
  const place = servicePlaceLine(service);
  const rating = serviceRatingLabel(service.rating);
  const modalities = service.modalities.map((modality) => serviceModalityLabel(modality, service.category)).join(" · ");
  return (
    <Link
      href={service.path}
      className="group flex h-full flex-col overflow-hidden rounded-panel border border-subtle bg-surface transition-colors duration-120 hover:border-line-strong"
    >
      <div className="relative aspect-[4/3] w-full bg-canvas">
        {cover ? (
          <Image src={cover} alt="" fill sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw" className="object-cover" priority={eager} />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <ServiceCategoryIcon category={service.category} />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
        <p className="t-micro text-ink-2">{serviceCategoryLabel(service.category)}</p>
        <Heading className="break-words t-card-title text-ink decoration-accent decoration-2 underline-offset-[3px] group-hover:underline">
          {service.title}
        </Heading>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 t-ui text-ink">
          <span className="min-w-0 break-words font-semibold">{service.provider.name}</span>
          <SellerKindMark kind={service.provider.kind} />
        </p>
        <p className="t-ui font-semibold tabular-nums text-ink">{formatServicePrice(service.priceFrom, service.priceUnit)}</p>
        {place ? <p className="t-meta">{place}</p> : null}
        {modalities ? <p className="t-meta">{modalities}</p> : null}
        {rating ? <p className="t-meta text-ink">{rating}</p> : null}
      </div>
    </Link>
  );
}

export const SERVICE_GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
