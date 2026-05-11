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

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function FeaturedListings({
  listings,
}: {
  listings: FeaturedListing[];
}) {
  return (
    <section className="bg-secondary/50 py-16 md:py-24">
      <PageContainer>
        <div className="mb-12 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-3xl text-foreground md:text-4xl">
              Anuncios destacados
            </h2>
            <p className="mt-2 text-muted-foreground">
              Instrumentos aprobados recientemente
            </p>
          </div>
          <Link
            href="/listados"
            className="hidden text-sm font-medium text-primary transition-colors hover:text-primary/80 md:inline-flex"
          >
            Ver todos
          </Link>
        </div>

        {listings.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {listings.map((listing) => (
              <motion.div key={listing.id} variants={item}>
                <Link
                  href={`/instrumentos/${listing.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
                    {listing.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={listing.imageUrl}
                        alt={listing.imageAlt}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                        Foto pendiente
                      </div>
                    )}
                    {listing.isVerifiedStore ? (
                      <span className="absolute left-3 top-3 rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-primary shadow-sm">
                        Tienda verificada
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 font-medium text-foreground transition-colors group-hover:text-primary">
                        {listing.title}
                      </h3>
                      <span className="flex-shrink-0 font-serif text-lg text-foreground">
                        {listing.price}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {listing.location}
                      </span>
                      {listing.isVerifiedStore ? (
                        <span className="flex items-center gap-1 text-primary">
                          <BadgeCheck className="h-3.5 w-3.5" />
                          Verificada
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Todavia no hay anuncios aprobados para mostrar.
          </div>
        )}

        <div className="mt-8 text-center md:hidden">
          <Link
            href="/listados"
            className="inline-flex text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Ver todos los anuncios
          </Link>
        </div>
      </PageContainer>
    </section>
  );
}
