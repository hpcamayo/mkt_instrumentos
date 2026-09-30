import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";
import { storeInitials } from "@/lib/ui/initials";

export type VerifiedStore = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  location: string;
  description: string;
};

export function VerifiedStores({ stores }: { stores: VerifiedStore[] }) {
  // Only real verified stores; the section stays hidden until there is one.
  if (!stores.length) return null;

  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <div className="rounded-panel border border-subtle bg-canvas p-5 sm:p-6">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="t-page text-ink">
              Tiendas verificadas
            </h2>
            <Link
              href="/registrar-tienda"
              className={buttonClasses({ variant: "secondary", className: "w-fit" })}
            >
              Registrar tienda
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </div>
      </PageContainer>
    </section>
  );
}

function StoreCard({ store }: { store: VerifiedStore }) {
  const content = (
    <article className="group overflow-hidden rounded-panel border border-subtle bg-white transition-colors duration-120 hover:border-line-strong">
      <div className="h-28 bg-frame-2">
        <div className="flex h-full items-center justify-center text-[28px] font-bold stretch-semicond text-surface">
          {store.logoUrl ? (
            <Image
              width={800}
              height={600}
              sizes="(max-width: 459px) 100vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 320px"
              src={store.logoUrl}
              alt={`Logo de ${store.name}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden="true">{storeInitials(store.name)}</span>
          )}
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1">
          <h3 className="truncate t-card-title text-ink underline-offset-4 group-hover:underline group-hover:decoration-accent group-hover:decoration-2">
            {store.name}
          </h3>
          <VerifiedIcon />
        </div>
        <span className="mt-2 flex items-center gap-1 t-meta">
          <MapPin className="h-3.5 w-3.5" />
          {store.location}
        </span>
        <p className="mt-3 line-clamp-3 t-meta">
          {store.description}
        </p>
      </div>
    </article>
  );

  return (
    <Link href={`/tiendas/${store.slug}`} className="block">
      {content}
    </Link>
  );
}
