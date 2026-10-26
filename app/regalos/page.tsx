import type { Metadata } from "next";
import { GiftFinder } from "@/components/discovery/gift-finder";
import { GIFTS_PATH } from "@/lib/discovery/gift-finder";
import { DEFAULT_OG_IMAGES, NOINDEX_FOLLOW_ROBOTS, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type GiftsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TITLE = "Regalos para músicos";
const DESCRIPTION = "Elige para quién es y tu presupuesto, y mira instrumentos y accesorios reales de particulares y tiendas en Perú.";

// The plain page is indexed; a chosen recipient or budget is a shareable view of it (noindex, follow).
export async function generateMetadata({ searchParams }: GiftsPageProps): Promise<Metadata> {
  const chosen = Object.keys(await searchParams).length > 0;
  return {
    title: TITLE,
    description: DESCRIPTION,
    ...(chosen ? { robots: NOINDEX_FOLLOW_ROBOTS } : { alternates: { canonical: GIFTS_PATH } }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${TITLE} | ${SITE_NAME}`, description: DESCRIPTION, url: GIFTS_PATH, images: DEFAULT_OG_IMAGES },
  };
}

// buy-05 "Para regalar" without an occasion (components/discovery/gift-finder.tsx).
export default async function GiftsPage({ searchParams }: GiftsPageProps) {
  return <GiftFinder occasion={null} searchParams={await searchParams} />;
}
