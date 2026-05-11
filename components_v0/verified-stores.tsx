"use client";

import { motion } from "framer-motion";
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

export function VerifiedStores({ stores }: { stores: VerifiedStore[] }) {
  return (
    <section className="py-16 md:py-24">
      <PageContainer>
        <div className="mb-12 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">
                Tiendas verificadas
              </span>
            </div>
            <h2 className="font-serif text-3xl text-foreground md:text-4xl">
              Compra con confianza
            </h2>
            <p className="mt-2 text-muted-foreground">
              Tiendas activas revisadas por Instrumentos Peru
            </p>
          </div>
        </div>

        {stores.length > 0 ? (
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {stores.map((store) => (
              <motion.div key={store.id} variants={item}>
                <Link
                  href={`/tiendas/${store.slug}`}
                  className="group block rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative h-14 w-14 overflow-hidden rounded-full bg-muted">
                      {store.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={store.logoUrl}
                          alt={`Logo de ${store.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                          {store.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <h3 className="truncate font-medium text-foreground transition-colors group-hover:text-primary">
                          {store.name}
                        </h3>
                        <BadgeCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                      </div>
                      <span className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {store.location}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="line-clamp-3 text-sm text-muted-foreground">
                      {store.description}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Pronto mostraremos tiendas verificadas.
          </div>
        )}
      </PageContainer>
    </section>
  );
}
