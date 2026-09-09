import { MarketplaceImage as Image } from "@/components/marketplace-image";
import { BadgeCheck, MapPin } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";

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
  "Guia rapida para comprar tu primera guitarra usada",
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
          <div className="rounded-lg border border-laria-fog bg-laria-cloud p-5 sm:p-6">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
                  Tiendas y musicos
                </p>
                <h2 className="laria-section-title mt-2 text-2xl uppercase md:text-3xl">
                  Que inspiran
                </h2>
              </div>
              <Link
                href="/registrar-tienda"
                className="laria-button-secondary min-h-10 w-fit px-4 py-2 text-xs uppercase tracking-wide"
              >
                Registrar tienda
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {visibleStores.map((store, index) => (
                <div key={store.id}>
                  <StoreCard
                    store={store}
                    isPlaceholder={!hasRealStores}
                    visualIndex={index}
                  />
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-lg border border-laria-fog bg-laria-cloud p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
              De la comunidad
            </p>
            <h2 className="laria-section-title mt-2 text-xl uppercase">
              Ideas para comprar mejor
            </h2>
            <div className="mt-5 grid gap-4">
              {communityItems.map((title, index) => (
                <div key={title} className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-laria-black text-sm font-black text-laria-yellow">
                    {index + 1}
                  </div>
                  <p className="text-sm font-bold leading-5 text-laria-ink">
                    {title}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-5 text-laria-muted">
              Bloque visual temporal. Laria aun no tiene una seccion real de
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
  visualIndex,
}: {
  store: VerifiedStore;
  isPlaceholder: boolean;
  visualIndex: number;
}) {
  const content = (
    <article className="group overflow-hidden rounded-lg border border-laria-fog bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div
        className={`h-28 bg-gradient-to-br ${getStoreGradient(visualIndex)}`}
      >
        <div className="flex h-full items-center justify-center text-2xl font-black text-white">
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
          <h3 className="truncate text-sm font-black text-laria-ink transition-colors group-hover:text-laria-blue">
            {store.name}
          </h3>
          <BadgeCheck className="h-4 w-4 shrink-0 text-laria-blue" />
        </div>
        <span className="mt-2 flex items-center gap-1 text-xs text-laria-muted">
          <MapPin className="h-3.5 w-3.5" />
          {store.location}
        </span>
        <p className="mt-3 line-clamp-3 text-xs leading-5 text-laria-text-soft">
          {store.description}
        </p>
        {isPlaceholder ? (
          <p className="mt-3 text-[11px] font-bold uppercase text-laria-blue">
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

function getStoreGradient(index: number) {
  const gradients = [
    "from-laria-black via-slate-800 to-laria-blue",
    "from-zinc-950 via-zinc-700 to-zinc-500",
    "from-blue-950 via-blue-700 to-cyan-400",
  ];

  return gradients[index % gradients.length];
}
