"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { Button } from "@/components_v0/ui/button";

export function CTASection() {
  return (
    <section className="py-20 md:py-32">
      <PageContainer>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl bg-secondary p-8 text-center md:p-16"
        >
          <div className="relative">
            <span className="mb-6 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Publicacion gratis
            </span>
            <h2 className="font-serif text-3xl tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Publica tu instrumento
              <br />
              <span className="text-primary">en minutos</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              Sube tu instrumento usado, espera la revision del equipo y recibe
              consultas directas por WhatsApp.
            </p>
            <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 rounded-full bg-primary px-8 text-base text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/publicar">
                  Publicar ahora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full px-8 text-base"
              >
                <Link href="/registrar-tienda">Registrar tienda</Link>
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              Sin pagos dentro de la plataforma, sin comisiones y con contacto por WhatsApp.
            </p>
          </div>
        </motion.div>
      </PageContainer>
    </section>
  );
}
