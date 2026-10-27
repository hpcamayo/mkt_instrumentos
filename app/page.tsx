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
import { renderPerRequestIfBuilding } from "@/lib/cache-build";
import { getListingCounts } from "@/lib/catalog-brands";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getRequestReads, optionalReadSignal } from "@/lib/supabase/public-read-client";

// Launch audit A19: one cached page for everyone, rebuilt in the background at most once a minute. The banner piece
// (H11) changes with each rebuild and new listings show within a minute (H2); the personal rows load in the browser.
export const revalidate = 60;
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

export const metadata: Metadata = buildHomeMetadata();

// Without the public keys every listing query counts as failed: those sections are left out, as on a query error.
const UNAVAILABLE: HomeData = { pool: null, priceDrops: null, total: null, categoryCounts: {}, stores: null };

// The home (docs/ux-redesign/ux-3-discovery.md § Home, reshaped by Effortless Laria BIG 01): the banner with the
// search, the category chips, then instruments right away: "¿Qué tocas?" on a first visit, "Nuevo desde tu última
// visita", "Para ti" (or the newest first), "Bajaron de precio" and "Vistos recientemente"; then "Cómo funciona Laria",
// "Tiendas verificadas" and the sell block. A failed listing query leaves its section out (logged on the server); when
// the newest listings themselves fail, the page throws, so visitors keep the last good copy instead of a failure cached
// for a minute (lib/cache-build.ts: during the deploy, this deployment renders the home on each request instead). An
// empty marketplace shows the empty feed.
export default async function HomePage() {
  const banner = pickHomeBanner();
  const { supabase, deadline } = getRequestReads();
  if (!supabase) warnMissingSupabaseEnv();
  const { pool, priceDrops, total, categoryCounts, stores } = supabase
    ? await fetchHomeData(supabase, getListingCounts(optionalReadSignal(deadline)))
    : UNAVAILABLE;
  if (supabase && !pool) {
    await renderPerRequestIfBuilding("/");
    throw new Error("The home feed could not be read.");
  }

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
