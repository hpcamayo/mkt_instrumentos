"use client";

import { motion } from "framer-motion";
import { Search } from "lucide-react";
import Link from "next/link";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h1 className="text-balance font-serif text-4xl leading-tight tracking-tight text-foreground md:text-6xl lg:text-7xl">
            Compra y vende instrumentos
            <br />
            <span className="text-primary">musicales en Peru</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-muted-foreground md:text-xl">
            Explora instrumentos usados de musicos y productos de tiendas
            pequenas. Contacta directo por WhatsApp y coordina con calma.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-12 max-w-2xl"
        >
          <Link href="/listados" className="relative block">
            <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <span className="flex h-14 w-full items-center rounded-full border border-border bg-card pl-14 pr-6 text-base text-muted-foreground shadow-lg transition hover:text-foreground md:h-16 md:text-lg">
              Que instrumento estas buscando?
            </span>
          </Link>
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
            <span>Popular:</span>
            <Link
              href="/listados?category=guitars"
              className="transition-colors hover:text-primary"
            >
              Guitarras
            </Link>
            <span>/</span>
            <Link
              href="/listados?category=drums"
              className="transition-colors hover:text-primary"
            >
              Baterias
            </Link>
            <span>/</span>
            <Link
              href="/listados?category=microphones"
              className="transition-colors hover:text-primary"
            >
              Microfonos
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
