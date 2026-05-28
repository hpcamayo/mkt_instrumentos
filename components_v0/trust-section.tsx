"use client";

import { motion } from "framer-motion";
import { BadgeCheck, MessageCircle, SearchCheck, Store } from "lucide-react";
import { PageContainer } from "@/components/page-container";

const features = [
  {
    icon: SearchCheck,
    title: "Publicaciones revisadas",
    description:
      "Listados aprobados para mantener el marketplace simple y ordenado.",
  },
  {
    icon: Store,
    title: "Tiendas activas",
    description: "Productos de tiendas tambien aparecen en la busqueda general.",
  },
  {
    icon: MessageCircle,
    title: "Contacto directo",
    description: "Habla con el vendedor por WhatsApp antes de coordinar.",
  },
  {
    icon: BadgeCheck,
    title: "Marketplace honesto",
    description: "Laria no procesa pagos, envios, garantias ni comisiones.",
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

export function TrustSection() {
  return (
    <section className="bg-white py-8">
      <PageContainer>
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          className="grid overflow-hidden rounded-lg border border-laria-fog bg-white shadow-sm md:grid-cols-4"
        >
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={item}
              className="border-b border-laria-fog p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eef5ff]">
                  <feature.icon className="h-5 w-5 text-laria-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-laria-ink">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-laria-text-soft">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </PageContainer>
    </section>
  );
}
