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

const categorySubtitles: Record<string, string> = {
  guitars: "Electricas y acusticas",
  basses: "Bajos electricos",
  drums: "Baterias y percusion",
  cymbals: "Platillos",
  microphones: "Audio profesional",
  pedals: "Efectos y pedales",
  amplifiers: "Amplificadores",
  "audio interfaces": "Estudio y grabacion",
};

const categoryVisuals: Record<string, string> = {
  guitars: "from-slate-950 via-slate-800 to-blue-900",
  basses: "from-black via-zinc-800 to-zinc-600",
  drums: "from-slate-100 via-white to-slate-300",
  cymbals: "from-yellow-200 via-amber-300 to-amber-500",
  microphones: "from-slate-700 via-slate-500 to-slate-200",
  pedals: "from-blue-900 via-blue-500 to-cyan-300",
  amplifiers: "from-zinc-900 via-zinc-700 to-zinc-500",
  "audio interfaces": "from-slate-900 via-blue-900 to-laria-blue",
};

export function CategoriesSection({ categories }: { categories: Category[] }) {
  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-laria-blue">
              Explora
            </p>
            <h2 className="laria-section-title mt-2 text-2xl uppercase md:text-3xl">
              Explora por categoria
            </h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-laria-text-soft">
            Encuentra instrumentos por tipo de equipo, desde guitarras y bajos
            hasta audio profesional.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {categories.map((category) => {
            const Icon =
              categoryIcons[category.value as keyof typeof categoryIcons] ??
              fallbackIcon;
            const visual =
              categoryVisuals[category.value] ??
              "from-laria-graphite to-laria-blue";

            return (
              <div key={category.value}>
                <Link
                  href={`/listados?category=${encodeURIComponent(category.value)}`}
                  className="group block overflow-hidden rounded-lg border border-laria-fog bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-laria-steel hover:shadow-lg"
                >
                  <div
                    className={`relative aspect-[4/3] bg-gradient-to-br ${visual}`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_24%,rgba(255,255,255,0.34),transparent_28%)]" />
                    <Icon className="absolute bottom-3 right-3 h-12 w-12 text-white drop-shadow-lg transition group-hover:scale-105" />
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-black leading-5 text-laria-ink transition-colors group-hover:text-laria-blue">
                      {category.label}
                    </h3>
                    <p className="mt-1 text-xs leading-4 text-laria-muted">
                      {categorySubtitles[category.value] ?? "Ver instrumentos"}
                    </p>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </PageContainer>
    </section>
  );
}
