import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GiftFinder } from "@/components/discovery/gift-finder";
import { getGiftOccasion, giftFinderHref } from "@/lib/discovery/gift-finder";
import { DEFAULT_OG_IMAGES, NOINDEX_FOLLOW_ROBOTS, OPEN_GRAPH_BASE, SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type OccasionPageProps = {
  params: Promise<{ ocasion: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: OccasionPageProps): Promise<Metadata> {
  const occasion = getGiftOccasion((await params).ocasion);
  if (!occasion) return {};
  const chosen = Object.keys(await searchParams).length > 0;
  const path = giftFinderHref(occasion.slug, null, null);
  return {
    title: occasion.heading,
    description: occasion.intro,
    ...(chosen ? { robots: NOINDEX_FOLLOW_ROBOTS } : { alternates: { canonical: path } }),
    openGraph: { ...OPEN_GRAPH_BASE, title: `${occasion.heading} | ${SITE_NAME}`, description: occasion.intro, url: path, images: DEFAULT_OG_IMAGES },
  };
}

// buy-05: the gift finder for Navidad, Día de la Madre, Día del Padre or a birthday.
export default async function OccasionPage({ params, searchParams }: OccasionPageProps) {
  const occasion = getGiftOccasion((await params).ocasion);
  if (!occasion) notFound();
  return <GiftFinder occasion={occasion} searchParams={await searchParams} />;
}
