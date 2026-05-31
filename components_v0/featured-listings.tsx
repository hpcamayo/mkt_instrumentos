"use client";

import { motion } from "framer-motion";
import { BadgeCheck, MapPin } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";

export type FeaturedListing = {
  id: string;
  title: string;
  slug: string;
  price: string;
  location: string;
  imageUrl: string | null;
  imageAlt: string;
  isVerifiedStore: boolean;
};

// UI placeholder only; replace with real data when feature/data is implemented.
const placeholderListings: FeaturedListing[] = [
  {
    id: "ui-placeholder-1",
    title: "Fender Stratocaster",
    slug: "",
    price: "S/ 3,900",
    location: "Lima, PE",
    imageUrl: null,
    imageAlt: "Guitarra electrica",
    isVerifiedStore: false,
  },
  {
    id: "ui-placeholder-2",
    title: "Amplificador valvular",
    slug: "",
    price: "S/ 2,400",
    location: "Arequipa, PE",
    imageUrl: null,
    imageAlt: "Amplificador",
    isVerifiedStore: true,
  },
  {
    id: "ui-placeholder-3",
    title: "Pedal delay digital",
    slug: "",
    price: "S/ 520",
    location: "Cusco, PE",
    imageUrl: null,
    imageAlt: "Pedal de efectos",
    isVerifiedStore: false,
  },
  {
    id: "ui-placeholder-4",
    title: "Monitor de estudio",
    slug: "",
    price: "S/ 1,100",
    location: "Trujillo, PE",
    imageUrl: null,
    imageAlt: "Monitor de estudio",
    isVerifiedStore: true,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

export function FeaturedListings({
  listings,
}: {
  listings: FeaturedListing[];
}) {
  const hasRealListings = listings.length > 0;
  const visibleListings = hasRealListings ? listings : placeholderListings;

  return (
    <section className="bg-laria-cloud py-10 md:py-14">
      <PageContainer>
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
              Destacados para ti
            </p>
            <h2 className="laria-section-title mt-2 text-2xl uppercase md:text-3xl">
              Instrumentos recientes
            </h2>
          </div>
          <Link
            href="/listados"
            className="hidden text-sm font-bold text-laria-ink transition-colors hover:text-laria-blue md:inline-flex"
          >
            Ver todos →
          </Link>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {visibleListings.map((listing, index) => (
            <motion.div key={listing.id} variants={item}>
              <ListingPreviewCard
                listing={listing}
                isPlaceholder={!hasRealListings}
                visualIndex={index}
              />
            </motion.div>
          ))}
        </motion.div>

        {!hasRealListings ? (
          <p className="mt-4 text-center text-sm text-laria-muted">
            Vista previa visual. Pronto apareceran publicaciones aprobadas.
          </p>
        ) : null}

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/listados"
            className="inline-flex text-sm font-bold text-laria-ink transition-colors hover:text-laria-blue"
          >
            Ver todos los anuncios
          </Link>
        </div>
      </PageContainer>
    </section>
  );
}

function ListingPreviewCard({
  listing,
  isPlaceholder,
  visualIndex,
}: {
  listing: FeaturedListing;
  isPlaceholder: boolean;
  visualIndex: number;
}) {
  const content = (
    <article className="group overflow-hidden rounded-lg border border-laria-fog bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative aspect-[4/3] bg-laria-fog">
        {listing.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt={listing.imageAlt}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${getPlaceholderGradient(visualIndex)} px-4 text-center text-sm font-bold text-white`}
          >
            {listing.imageAlt}
          </div>
        )}

        <span className="absolute left-3 top-3 rounded bg-laria-blue px-2 py-1 text-[11px] font-black uppercase text-laria-black">
          {isPlaceholder ? "Vista previa" : "Nuevo"}
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-laria-ink transition-colors group-hover:text-laria-blue">
            {listing.title}
          </h3>
          <span className="shrink-0 text-right text-sm font-black text-laria-ink">
            {listing.price}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-laria-muted">
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {listing.location}
          </span>
          {listing.isVerifiedStore ? (
            <span className="flex items-center gap-1 text-laria-blue">
              <BadgeCheck className="h-3.5 w-3.5" />
              Tienda
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );

  if (isPlaceholder) {
    return content;
  }

  return (
    <Link href={`/instrumentos/${listing.slug}`} className="block">
      {content}
    </Link>
  );
}

function getPlaceholderGradient(index: number) {
  const gradients = [
    "from-laria-black via-slate-800 to-laria-blue",
    "from-zinc-950 via-zinc-700 to-zinc-500",
    "from-blue-950 via-blue-700 to-cyan-400",
    "from-slate-900 via-slate-700 to-slate-400",
  ];

  return gradients[index % gradients.length];
}
