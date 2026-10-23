import type { Metadata } from "next";
import { HomeBanner } from "@/components/home/home-banner";
import { RecentlyViewed } from "@/components/catalog-recently-viewed";
import { HomeFollowedArrivals } from "@/components/home/home-followed";
import { HomeForYou } from "@/components/home/home-for-you";
import { CategoryTiles, HowItWorks, PriceDropsSection, SellBlock, VerifiedStoresSection } from "@/components/home/home-sections";
import { RecentListings } from "@/components/home/home-empty";
import { JsonLd } from "@/components/json-ld";
import { PageContainer } from "@/components/page-container";
import { fetchHomeData, type HomeData } from "@/lib/home";
import { pickHomeBanner } from "@/lib/home-banner";
import { buildHomeMetadata, buildOrganizationJsonLd } from "@/lib/seo";
import { getPublicSupabaseClient, warnMissingSupabaseEnv } from "@/lib/supabase/public-client";

// Dynamic: the banner piece is picked per request (H11) and the listings refresh by themselves (H2).
export const dynamic = "force-dynamic";

export const metadata: Metadata = buildHomeMetadata();

// Without the public keys every listing query counts as failed: those sections are left out, as on a query error.
const UNAVAILABLE: HomeData = { pool: null, priceDrops: null, total: null, categoryCounts: {}, stores: null };

// The home (docs/ux-redesign/ux-3-discovery.md § Home, reshaped by Effortless Laria BIG 01): the banner with the
// search, the category chips, then instruments right away: "¿Qué tocas?" on a first visit, "Nuevo desde tu última
// visita", "Para ti" (or the newest first), "Bajaron de precio" and "Vistos recientemente"; then "Cómo funciona Laria",
// "Tiendas verificadas" and the sell block. A failed listing query leaves its section out (logged on the server); an
// empty marketplace shows the empty feed.
export default async function HomePage() {
  const banner = pickHomeBanner();
  const supabase = getPublicSupabaseClient();
  if (!supabase) warnMissingSupabaseEnv();
  const { pool, priceDrops, total, categoryCounts, stores } = supabase ? await fetchHomeData(supabase) : UNAVAILABLE;

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <HomeBanner banner={banner} />
      <PageContainer className="flex flex-col gap-8 pb-8 pt-4 md:gap-12 md:pb-12 md:pt-6">
        <CategoryTiles counts={categoryCounts} />
        <HomeFollowedArrivals />
        {pool?.length ? <HomeForYou pool={pool} total={total} /> : pool ? <RecentListings /> : null}
        {priceDrops?.length ? <PriceDropsSection listings={priceDrops} /> : null}
        <RecentlyViewed />
        <HowItWorks />
        {stores?.length ? <VerifiedStoresSection stores={stores} /> : null}
        <SellBlock />
      </PageContainer>
    </>
  );
}
