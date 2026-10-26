import type { CatalogScope } from "@/lib/catalog-filters";
import { instrumentTypesByCategory } from "@/lib/listing-submission";
import { categoryOptions, legacyCategories } from "@/lib/listings";

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
  keyboards: {
    slug: "teclados",
    heading: "Teclados y pianos en venta en Perú",
    description: "Pianos digitales, sintetizadores y teclados usados y de tiendas en Perú. Compara precios y contacta al vendedor directo por WhatsApp.",
    intro: "Pianos digitales, sintetizadores, teclados arreglistas y controladores publicados por particulares y tiendas. Revisa teclas, estado y ubicación antes de coordinar.",
  },
  percussion: {
    slug: "percusion",
    heading: "Percusión en venta en Perú",
    description: "Baterías, platillos, cajones y percusión latina usados y de tiendas en Perú. Revisa fotos y precios y contacta directo por WhatsApp.",
    intro: "Baterías acústicas y electrónicas, platillos, cajones, congas y más, publicados por particulares y tiendas. Compara configuración, medida y estado antes de contactar.",
  },
  winds: {
    slug: "vientos",
    heading: "Instrumentos de viento en venta en Perú",
    description: "Saxofones, trompetas, flautas y más instrumentos de viento usados y de tiendas en Perú. Contacta al vendedor directo por WhatsApp.",
    intro: "Saxofones, trompetas, trombones, clarinetes, flautas, armónicas y acordeones publicados por particulares y tiendas en Perú.",
  },
  strings: {
    slug: "cuerdas",
    heading: "Ukeleles, violines y más instrumentos de cuerda en venta en Perú",
    description: "Ukeleles, violines, mandolinas y otros instrumentos de cuerda usados y de tiendas en Perú. Contacta al vendedor directo por WhatsApp.",
    intro: "Ukeleles, violines, violas, violonchelos, mandolinas y banjos publicados por particulares y tiendas. Revisa fotos y estado antes de coordinar.",
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
  audio: {
    slug: "audio",
    heading: "Equipos de audio en venta en Perú",
    description: "Interfaces de audio, mezcladoras, parlantes, monitores y audífonos usados y de tiendas en Perú. Contacta al vendedor directo por WhatsApp.",
    intro: "Interfaces, mezcladoras, parlantes, monitores de estudio y audífonos publicados por particulares y tiendas. Revisa entradas, potencia y estado antes de coordinar.",
  },
  andean: {
    slug: "andinos",
    heading: "Instrumentos andinos y tradicionales en venta en Perú",
    description: "Charangos, quenas, zampoñas, tinyas y bombos andinos usados, de tiendas y de talleres peruanos. Contacta al vendedor o al luthier directo por WhatsApp.",
    intro: "Charangos, ronrocos, quenas, zampoñas, antaras, tinyas y bombos andinos publicados por particulares, tiendas y talleres que los hacen a mano. El cajón está en Percusión.",
  },
} satisfies Record<CategoryValue, Omit<CategoryLandingPage, "category" | "label">>;

export const categoryLandingPages: readonly CategoryLandingPage[] = categoryOptions.map((option) => ({
  ...landingCopy[option.value],
  category: option.value,
  label: option.label,
}));

// Landings of the categories retired on 12 Oct 2026 → the type they became (`legacyCategories` in lib/listings.ts).
// The landing route answers them with a permanent redirect to that type, so indexed URLs keep their visitors.
export const legacyCategorySlugs: Readonly<Record<string, string>> = {
  baterias: "drums",
  platillos: "cymbals",
  "interfaces-de-audio": "audio interfaces",
};

// Listing-detail slugs are generated as `<title>-<uuid>` (and relists add a
// suffix), so these bare category slugs never match a real listing.
export const reservedCategorySlugs: ReadonlySet<string> = new Set([
  ...categoryLandingPages.map((page) => page.slug),
  ...Object.keys(legacyCategorySlugs),
]);

export function getCategoryLandingBySlug(slug: string) {
  return categoryLandingPages.find((page) => page.slug === slug) ?? null;
}

// Where a retired landing slug now lives: the new category's type ("/instrumentos/baterias" → Percusión, Baterías).
export function legacyCategoryRedirect(slug: string) {
  const legacy = legacyCategories[legacyCategorySlugs[slug] ?? ""];
  return legacy ? categoryTypePath(legacy.category, legacy.instrumentType) : null;
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
// category's only specific type (e.g. winds → winds), `instrument_type`
// adds nothing, so the link goes to the category landing instead.
export function categoryTypePath(category: string, instrumentType: string) {
  const specificTypes = (instrumentTypesByCategory[category] ?? []).filter((type) => type !== "other");
  if (specificTypes.length === 1 && specificTypes[0] === instrumentType) return categoryLandingPath(category);
  return `/listados?${new URLSearchParams({ category, instrument_type: instrumentType })}`;
}
