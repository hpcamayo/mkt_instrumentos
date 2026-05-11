"use client";

import { motion } from "framer-motion";
import {
  Drum,
  Guitar,
  Headphones,
  Mic,
  Music,
  Piano,
  Sliders,
  Speaker,
} from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";

type Category = {
  value: string;
  label: string;
};

const categoryIcons = {
  guitars: Guitar,
  basses: Music,
  drums: Drum,
  cymbals: Drum,
  microphones: Mic,
  pedals: Sliders,
  amplifiers: Speaker,
  "audio interfaces": Headphones,
} as const;

const fallbackIcon = Piano;

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

export function CategoriesSection({ categories }: { categories: Category[] }) {
  return (
    <section className="py-16 md:py-24">
      <PageContainer>
        <div className="mb-12 text-center">
          <h2 className="font-serif text-3xl text-foreground md:text-4xl">
            Explora por categoria
          </h2>
          <p className="mt-4 text-muted-foreground">
            Encuentra instrumentos por tipo de equipo
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6"
        >
          {categories.map((category) => {
            const Icon =
              categoryIcons[category.value as keyof typeof categoryIcons] ??
              fallbackIcon;

            return (
              <motion.div key={category.value} variants={item}>
                <Link
                  href={`/listados?category=${encodeURIComponent(category.value)}`}
                  className="group flex flex-col items-center rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:shadow-lg md:p-8"
                >
                  <div className="rounded-full bg-secondary p-4 transition-colors group-hover:bg-primary/10">
                    <Icon className="h-6 w-6 text-foreground transition-colors group-hover:text-primary md:h-8 md:w-8" />
                  </div>
                  <h3 className="mt-4 text-center font-medium text-foreground transition-colors group-hover:text-primary">
                    {category.label}
                  </h3>
                  <p className="mt-1 text-center text-sm text-muted-foreground">
                    Ver instrumentos
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      </PageContainer>
    </section>
  );
}
