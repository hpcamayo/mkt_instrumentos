"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";

export function CTASection() {
  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="relative overflow-hidden rounded-lg bg-laria-black p-6 text-white shadow-2xl shadow-black/15 sm:p-8 lg:p-10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(107,166,255,0.34),transparent_34%),linear-gradient(90deg,rgba(5,6,8,1),rgba(16,18,23,0.76))]" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-laria-yellow">
                Publica gratis
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-black uppercase leading-tight tracking-tight md:text-5xl">
                La musica nos conecta.
                <br />
                <span className="text-laria-blue">Laria lo hace posible.</span>
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70 md:text-base">
                Sube tu instrumento, espera la revision del equipo y recibe
                consultas directas por WhatsApp.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Link
                href="/publicar"
                className="laria-button-primary min-h-12 px-6 py-3 text-sm uppercase tracking-wide"
              >
                Publicar mi equipo
              </Link>
              <Link
                href="/listados"
                className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/40 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:border-laria-blue hover:text-laria-blue"
              >
                Explorar productos
              </Link>
            </div>
          </div>
        </motion.div>
      </PageContainer>
    </section>
  );
}
