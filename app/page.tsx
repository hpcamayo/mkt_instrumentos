import Link from "next/link";
import { categoryOptions } from "@/lib/listings";

export default function HomePage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Instrumentos en Perú
          </p>
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-ink sm:text-4xl">
              Encuentra tu próximo instrumento musical
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Explora equipos usados de músicos y productos de tiendas pequeñas.
              Habla directo por WhatsApp, coordina con calma y revisa cada
              instrumento antes de comprar.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/listados"
              className="inline-flex items-center justify-center rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Explorar instrumentos
            </Link>
            <Link
              href="/vender"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-ink transition hover:bg-slate-100"
            >
              Vender mi instrumento
            </Link>
          </div>
        </div>
        <div className="rounded-lg bg-mist p-5">
          <h2 className="text-lg font-semibold text-ink">Compra con confianza</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>Solo mostramos publicaciones aprobadas por el equipo.</li>
            <li>Las tiendas activas tienen página pública dentro del marketplace.</li>
            <li>El contacto es directo por WhatsApp. No cobramos ni retenemos pagos.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brass">
              Categorías
            </p>
            <h2 className="mt-2 text-xl font-bold text-ink">
              Busca por tipo de equipo
            </h2>
          </div>
          <Link
            href="/listados"
            className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline"
          >
            Ver todo
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categoryOptions.map((category) => (
            <Link
              key={category.value}
              href={`/listados?category=${encodeURIComponent(category.value)}`}
              className="rounded-md border border-slate-200 px-3 py-3 text-sm font-semibold text-ink transition hover:border-brass hover:bg-amber-50"
            >
              {category.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
