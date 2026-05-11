"use client";

import { motion } from "framer-motion";
import { BadgeCheck, MessageCircle, SearchCheck, Store } from "lucide-react";
import { PageContainer } from "@/components/page-container";

const features = [
  {
    icon: SearchCheck,
    title: "Publicaciones revisadas",
    description:
      "Mostramos listados aprobados para mantener el marketplace simple y ordenado.",
  },
  {
    icon: Store,
    title: "Tiendas activas",
    description:
      "Las tiendas tienen paginas publicas y sus productos aparecen en la busqueda general.",
  },
  {
    icon: MessageCircle,
    title: "Contacto por WhatsApp",
    description:
      "Habla directo con el vendedor para consultar detalles y coordinar la compra.",
  },
  {
    icon: BadgeCheck,
    title: "Sin pagos en la plataforma",
    description:
      "Instrumentos Peru no procesa pagos, envios, garantias ni comisiones.",
  },
];

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

export function TrustSection() {
  return (
    <section className="bg-foreground py-16 md:py-24">
      <PageContainer>
        <div className="mb-12 text-center">
          <h2 className="font-serif text-3xl text-background md:text-4xl">
            Un marketplace directo para musicos
          </h2>
          <p className="mt-4 text-background/70">
            Simple, practico y enfocado en descubrir instrumentos en Peru
          </p>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={item}
              className="text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-background/10">
                <feature.icon className="h-6 w-6 text-background" />
              </div>
              <h3 className="mb-2 font-medium text-background">
                {feature.title}
              </h3>
              <p className="text-sm text-background/70">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </PageContainer>
    </section>
  );
}
