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
import { categoryLandingPath } from "@/lib/category-pages";

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


export function CategoriesSection({ categories }: { categories: Category[] }) {
  return (
    <section className="bg-white py-10 md:py-14">
      <PageContainer>
        <div className="mb-7 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="t-micro text-ink-2">
              Explora
            </p>
            <h2 className="mt-2 t-page text-ink">
              Explora por categoria
            </h2>
          </div>
          <p className="max-w-md t-ui text-ink-2">
            Encuentra instrumentos por tipo de equipo, desde guitarras y bajos
            hasta audio profesional.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {categories.map((category) => {
            const Icon =
              categoryIcons[category.value as keyof typeof categoryIcons] ??
              fallbackIcon;

            return (
              <div key={category.value}>
                <Link
                  href={categoryLandingPath(category.value)}
                  className="group block overflow-hidden rounded-panel border border-subtle bg-white transition-colors duration-120 hover:border-line-strong"
                >
                  <div className="relative aspect-[4/3] bg-canvas">
                    <Icon className="absolute bottom-3 right-3 h-12 w-12 text-ink" aria-hidden="true" />
                  </div>
                  <div className="p-3">
                    <h3 className="t-card-title text-ink underline-offset-4 group-hover:underline group-hover:decoration-accent group-hover:decoration-2">
                      {category.label}
                    </h3>
                    <p className="mt-1 t-meta">
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
