import type { Metadata } from "next";
import { HomeBanner } from "@/components/home/home-banner";
import { CategoryTiles, HowItWorks, RecentListings, SellBlock, ShowcaseSection, VerifiedStoresSection } from "@/components/home/home-sections";
import { JsonLd } from "@/components/json-ld";
import { PageContainer } from "@/components/page-container";
import { fetchHomeData, type HomeData } from "@/lib/home";
import { pickHomeBanner } from "@/lib/home-banner";
import { buildHomeMetadata, buildOrganizationJsonLd } from "@/lib/seo";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";

// Dynamic: the banner piece is picked per request (H11) and the vitrina and feed refresh by themselves (H2).
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildHomeMetadata();

// Without the public keys every listing query counts as failed: those sections are left out, as on a query error.
const UNAVAILABLE: HomeData = { vitrina: null, feed: null, total: null, categoryCounts: {}, stores: null };

// The decided home (docs/ux-redesign/ux-3-discovery.md § Home, "Inicio · versión final"): the banner, then "En
// vitrina", "Explora por categoría", "Recién publicados", "Cómo funciona Laria", "Tiendas verificadas" and the sell
// block; the shell adds the home header and the full footer (lib/shell.ts). A failed listing query leaves its section
// out (logged on the server); an empty vitrina and no verified stores hide their sections.
export default async function HomePage() {
  const banner = pickHomeBanner();
  const supabase = getPublicSupabaseClient();
  if (!supabase) warnMissingSupabaseEnv();
  const { vitrina, feed, total, categoryCounts, stores } = supabase ? await fetchHomeData(supabase) : UNAVAILABLE;
  // The feed's empty state is for a marketplace with nothing published; when the vitrina holds every listing the
  // feed has nothing new to add and is left out.
  const showFeed = feed !== null && (feed.length > 0 || !vitrina?.length);

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <HomeBanner banner={banner} />
      <PageContainer className="flex flex-col gap-8 pb-8 pt-6 md:gap-12 md:pb-12 md:pt-8">
        {vitrina?.length ? <ShowcaseSection listings={vitrina} total={total} /> : null}
        <CategoryTiles counts={categoryCounts} />
        {showFeed ? <RecentListings listings={feed} total={total} /> : null}
        <HowItWorks />
        {stores?.length ? <VerifiedStoresSection stores={stores} /> : null}
        <SellBlock />
      </PageContainer>
    </>
  );
}
