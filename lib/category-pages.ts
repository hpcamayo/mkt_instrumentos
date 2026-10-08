import type { CatalogScope } from "@/lib/catalog-filters";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import { categoryOptions } from "@/lib/listings";

type CategoryValue = (typeof categoryOptions)[number]["value"];

export type CategoryLandingPage = {
  slug: string;
  category: CategoryValue;
  label: string;
  heading: string;
  description: string;
  intro: string;
};

// SEO copy and URL slugs for the existing canonical categories. The category
// values and labels still come from `categoryOptions`; this is not a second taxonomy.
const landingCopy = {
  guitars: {
    slug: "guitarras",
    heading: "Guitarras en venta en Perú",
    description: "Guitarras eléctricas y acústicas usadas y de tiendas en Perú. Compara precios y contacta al vendedor directo por WhatsApp.",
    intro: "Guitarras eléctricas y acústicas publicadas por particulares y tiendas. Revisa fotos, estado y ubicación, y conversa directo con el vendedor.",
  },
  basses: {
    slug: "bajos",
    heading: "Bajos en venta en Perú",
    description: "Bajos eléctricos usados y de tiendas en Perú. Compara precios, estado y ubicación, y contacta directo por WhatsApp.",
    intro: "Bajos publicados por particulares y tiendas en Perú. Revisa fotos y detalles técnicos antes de coordinar con el vendedor.",
  },
  drums: {
    slug: "baterias",
    heading: "Baterías en venta en Perú",
    description: "Baterías acústicas y electrónicas usadas y de tiendas en Perú. Revisa fotos y precios y contacta directo por WhatsApp.",
    intro: "Baterías y sets publicados por particulares y tiendas. Compara configuración, estado y ubicación antes de contactar.",
  },
  cymbals: {
    slug: "platillos",
    heading: "Platillos en venta en Perú",
    description: "Platillos usados y de tiendas en Perú: crash, ride, hi-hat y más. Contacta al vendedor directo por WhatsApp.",
    intro: "Platillos publicados por particulares y tiendas. Revisa tipo, medida y estado antes de coordinar con el vendedor.",
  },
  microphones: {
    slug: "microfonos",
    heading: "Micrófonos en venta en Perú",
    description: "Micrófonos dinámicos y de condensador usados y de tiendas en Perú. Compara precios y contacta directo por WhatsApp.",
    intro: "Micrófonos para voz, instrumentos y estudio publicados por particulares y tiendas en Perú.",
  },
  pedals: {
    slug: "pedales",
    heading: "Pedales de efecto en venta en Perú",
    description: "Pedales de efecto usados y de tiendas en Perú: distorsión, delay, reverb y más. Contacta directo por WhatsApp.",
    intro: "Pedales de efecto publicados por particulares y tiendas. Revisa tipo de efecto, estado y precio antes de contactar.",
  },
  amplifiers: {
    slug: "amplificadores",
    heading: "Amplificadores en venta en Perú",
    description: "Amplificadores de guitarra y bajo usados y de tiendas en Perú. Compara potencia, estado y precio y contacta por WhatsApp.",
    intro: "Amplificadores y cabezales publicados por particulares y tiendas en Perú.",
  },
  "audio interfaces": {
    slug: "interfaces-de-audio",
    heading: "Interfaces de audio en venta en Perú",
    description: "Interfaces de audio usadas y de tiendas en Perú para grabar en casa o en estudio. Contacta al vendedor directo por WhatsApp.",
    intro: "Interfaces de audio publicadas por particulares y tiendas. Revisa entradas, conexión y estado antes de coordinar.",
  },
} satisfies Record<CategoryValue, Omit<CategoryLandingPage, "category" | "label">>;

export const categoryLandingPages: readonly CategoryLandingPage[] = categoryOptions.map((option) => ({
  ...landingCopy[option.value],
  category: option.value,
  label: option.label,
}));

// Listing-detail slugs are generated as `<title>-<uuid>` (and relists add a
// suffix), so these bare category slugs never match a real listing.
export const reservedCategorySlugs: ReadonlySet<string> = new Set(categoryLandingPages.map((page) => page.slug));

export function getCategoryLandingBySlug(slug: string) {
  return categoryLandingPages.find((page) => page.slug === slug) ?? null;
}

export function getCategoryLandingByValue(category: string | undefined) {
  if (!category) return null;
  return categoryLandingPages.find((page) => page.category === category) ?? null;
}

// The catalog filters' scope on a landing: its category fixed, its own path for "nothing else chosen".
export function landingScope(category: string): CatalogScope {
  const landing = getCategoryLandingByValue(category);
  return landing ? { landing: { category, path: `/instrumentos/${landing.slug}` } } : {};
}

export function categoryLandingPath(category: string) {
  const page = getCategoryLandingByValue(category);
  return page ? `/instrumentos/${page.slug}` : `/listados?${new URLSearchParams({ category })}`;
}

// Catalog URL for one instrument type inside a category. When the type is the
// category's only specific type (e.g. cymbals → cymbals), `instrument_type`
// adds nothing, so the link goes to the category landing instead.
export function categoryTypePath(category: string, instrumentType: string) {
  const specificTypes = (instrumentTypesByCategory[category] ?? []).filter((type) => type !== "other");
  if (specificTypes.length === 1 && specificTypes[0] === instrumentType) return categoryLandingPath(category);
  return `/listados?${new URLSearchParams({ category, instrument_type: instrumentType })}`;
}
