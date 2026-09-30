import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { MapPin } from "lucide-react";
import Link from "next/link";
import { VerifiedIcon } from "@/components/ui/verified-mark";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";

export type VerifiedStore = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  location: string;
  description: string;
};

// UI placeholder only; replace with real community/content data when feature is implemented.
const communityItems = [
  "Guía rápida para comprar tu primera guitarra usada",
  "Como revisar un amplificador antes de cerrar trato",
  "Checklist para publicar mejores fotos de tu instrumento",
];

// UI placeholder only; replace with real store discovery data when feature is implemented.
const placeholderStores: VerifiedStore[] = [
  {
    id: "ui-store-1",
    name: "Tienda demo",
    slug: "",
    logoUrl: null,
    location: "Lima, PE",
    description: "Vista previa de tienda verificada para el nuevo diseño.",
  },
  {
    id: "ui-store-2",
    name: "Backline demo",
    slug: "",
    logoUrl: null,
    location: "Arequipa, PE",
    description: "Espacio visual temporal hasta tener tiendas activas.",
  },
  {
    id: "ui-store-3",
    name: "Audio demo",
    slug: "",
    logoUrl: null,
    location: "Cusco, PE",
    description: "Bloque placeholder sin funcionalidad nueva.",
  },
];

export function VerifiedStores({ stores }: { stores: VerifiedStore[] }) {
  const hasRealStores = stores.length > 0;
  const visibleStores = hasRealStores ? stores : placeholderStores;

  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-panel border border-subtle bg-canvas p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="t-micro text-ink-2">
                  Tiendas y músicos
                </p>
                <h2 className="mt-2 t-page text-ink">
                  Que inspiran
                </h2>
              </div>
              <Link
                href="/registrar-tienda"
                className={buttonClasses({ variant: "secondary", className: "w-fit" })}
              >
                Registrar tienda
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {visibleStores.map((store) => (
                <div key={store.id}>
                  <StoreCard
                    store={store}
                    isPlaceholder={!hasRealStores}
                  />
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-panel border border-subtle bg-canvas p-5 sm:p-6">
            <p className="t-micro text-ink-2">
              De la comunidad
            </p>
            <h2 className="mt-2 t-section text-ink">
              Ideas para comprar mejor
            </h2>
            <div className="mt-5 grid gap-4">
              {communityItems.map((title, index) => (
                <div key={title} className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-frame t-ui font-semibold text-surface">
                    {index + 1}
                  </div>
                  <p className="t-ui font-semibold text-ink">
                    {title}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 t-meta">
              Bloque visual temporal. Laria aún no tiene una sección real de
              comunidad o blog.
            </p>
          </aside>
        </div>
      </PageContainer>
    </section>
  );
}

function StoreCard({
  store,
  isPlaceholder,
}: {
  store: VerifiedStore;
  isPlaceholder: boolean;
}) {
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
            store.name.charAt(0)
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
        {isPlaceholder ? (
          <p className="mt-3 t-micro text-ink-2">
            Vista previa
          </p>
        ) : null}
      </div>
    </article>
  );

  if (isPlaceholder) {
    return content;
  }

  return (
    <Link href={`/tiendas/${store.slug}`} className="block">
      {content}
    </Link>
  );
}
