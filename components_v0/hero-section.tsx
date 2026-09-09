import Image from "next/image";
import { BadgeCheck, MessageCircle, Search, Store, Zap } from "lucide-react";
import Link from "next/link";
import { PageContainer } from "@/components/page-container";

const heroStats = [
  { icon: BadgeCheck, label: "Listados revisados" },
  { icon: Store, label: "Tiendas activas" },
  { icon: MessageCircle, label: "Contacto por WhatsApp" },
  { icon: Zap, label: "Hecho para musicos" },
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-laria-black py-16 text-white sm:py-20 lg:py-24">
      <Image
        src="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=2400&q=80"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(5,6,8,0.98)_0%,rgba(5,6,8,0.88)_40%,rgba(5,6,8,0.34)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_72%_18%,rgba(107,166,255,0.34),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(5,6,8,0.74)_100%)]" />
      <PageContainer className="relative">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.26em] text-laria-yellow">
            Marketplace musical en Peru
          </p>
          <h1 className="mt-5 text-balance text-5xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Tu escenario.
            <br />
            Tu sonido.
            <br />
            <span className="text-laria-blue">Tu Laria.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-white/78 md:text-lg">
            Explora instrumentos usados de musicos y productos de tiendas
            pequenas. Contacta directo por WhatsApp y coordina con calma.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/listados"
              className="laria-button-primary min-h-12 px-6 py-3 text-sm uppercase tracking-wide"
            >
              Comprar ahora
            </Link>
            <Link
              href="/vender"
              className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/45 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:border-laria-blue hover:text-laria-blue"
            >
              Vender mi equipo
            </Link>
          </div>
        </div>

        <div className="mt-10 max-w-2xl">
          <Link href="/listados" className="relative block">
            <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-laria-blue" />
            <span className="flex h-14 w-full items-center rounded-full border border-white/16 bg-white/95 pl-14 pr-6 text-sm font-medium text-laria-muted shadow-2xl shadow-black/35 transition hover:text-laria-ink md:h-16 md:text-base">
              Que instrumento estas buscando?
            </span>
          </Link>
          <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/66">
            <span>Popular:</span>
            <Link
              href="/listados?category=guitars"
              className="font-semibold text-white transition-colors hover:text-laria-yellow"
            >
              Guitarras
            </Link>
            <span>/</span>
            <Link
              href="/listados?category=drums"
              className="font-semibold text-white transition-colors hover:text-laria-yellow"
            >
              Baterias
            </Link>
            <span>/</span>
            <Link
              href="/listados?category=microphones"
              className="font-semibold text-white transition-colors hover:text-laria-yellow"
            >
              Microfonos
            </Link>
          </div>
        </div>

        <div className="mt-12 grid gap-3 border-t border-white/12 pt-6 text-sm text-white/74 sm:grid-cols-2 lg:grid-cols-4">
          {heroStats.map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/8">
                <stat.icon className="h-4 w-4 text-laria-blue" />
              </span>
              <span className="font-semibold">{stat.label}</span>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
