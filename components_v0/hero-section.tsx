import Image from "next/image";
import { BadgeCheck, MessageCircle, Search, Store, Zap } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";

const heroStats = [
  { icon: BadgeCheck, label: "Publicaciones revisadas" },
  { icon: Store, label: "Tiendas activas" },
  { icon: MessageCircle, label: "Contacto por WhatsApp" },
  { icon: Zap, label: "Hecho para músicos" },
];

export function HeroSection() {
  return (
    <section className="surface-frame relative isolate overflow-hidden bg-frame py-16 text-white sm:py-20 lg:py-24">
      <Image
        src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=2400&q=80"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,6,8,0.98)_0%,rgba(5,6,8,0.88)_40%,rgba(5,6,8,0.34)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_0%,rgba(5,6,8,0.74)_100%)]" />
      <PageContainer className="relative">
        <div className="max-w-3xl">
          <p className="t-micro text-muted-dark">
            Marketplace musical en Perú
          </p>
          <h1 className="mt-5 text-balance text-[36px] font-bold leading-[40px] stretch-semicond text-white sm:text-[46px] sm:leading-[50px]">
            Tu escenario.
            <br />
            Tu sonido.
            <br />
            <span className="text-accent">Tu Laria.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty t-body text-muted-dark md:text-[18px] md:leading-[28px]">
            Instrumentos de músicos y tiendas de todo el Perú. Contacta
            directo por WhatsApp y coordina con calma.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/listados"
              className={buttonClasses()}
            >
              Comprar ahora
            </Link>
            <Link
              href="/vender"
              className={buttonClasses({ variant: "onDark" })}
            >
              Vender mi equipo
            </Link>
          </div>
        </div>

        <div className="mt-10 max-w-2xl">
          <Link href="/listados" className="relative block">
            <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink" aria-hidden="true" />
            <span className="flex h-14 w-full items-center rounded-control bg-white pl-14 pr-6 t-body text-ink-3 transition-colors duration-120 hover:text-ink md:h-16">
              ¿Qué instrumento buscas?
            </span>
          </Link>
          <div className="mt-4 flex flex-wrap gap-2 t-ui text-muted-dark">
            <span>Popular:</span>
            <Link
              href="/instrumentos/guitarras"
              className="font-semibold text-white underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2"
            >
              Guitarras
            </Link>
            <span>/</span>
            <Link
              href="/instrumentos/baterias"
              className="font-semibold text-white underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2"
            >
              Baterías
            </Link>
            <span>/</span>
            <Link
              href="/instrumentos/microfonos"
              className="font-semibold text-white underline-offset-4 hover:underline hover:decoration-accent hover:decoration-2"
            >
              Micrófonos
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-3 border-t border-white/12 pt-6 t-ui text-surface sm:grid-cols-2 lg:grid-cols-4">
          {heroStats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/8">
                <stat.icon className="h-4 w-4 text-accent" aria-hidden="true" />
              </span>
              <span className="font-semibold">{stat.label}</span>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
