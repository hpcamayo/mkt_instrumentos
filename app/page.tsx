import type { Metadata } from "next";
import Link from "next/link";
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
import { buttonClasses } from "@/components/ui/button";
import { NoticeIcon, noticeClassName } from "@/components/ui/notice";
import { getListingCounts } from "@/lib/catalog-brands";
import { warnMissingSupabaseEnv } from "@/lib/supabase/public-client";
import { getRequestReads, optionalReadSignal } from "@/lib/supabase/public-read-client";

// Dynamic: the banner piece is picked per request (H11) and the listings refresh by themselves (H2).
export const dynamic = "force-dynamic";
// A hard stop well past the read budgets (lib/request-deadline.ts), far below Vercel's 300 s default.
export const maxDuration = 30;

export const metadata: Metadata = buildHomeMetadata();

// Without the public keys every listing query counts as failed: those sections are left out, as on a query error.
const UNAVAILABLE: HomeData = { pool: null, priceDrops: null, total: null, categoryCounts: {}, stores: null };

// The home (docs/ux-redesign/ux-3-discovery.md § Home, reshaped by Effortless Laria BIG 01): the banner with the
// search, the category chips, then instruments right away: "¿Qué tocas?" on a first visit, "Nuevo desde tu última
// visita", "Para ti" (or the newest first), "Bajaron de precio" and "Vistos recientemente"; then "Cómo funciona Laria",
// "Tiendas verificadas" and the sell block. A failed listing query leaves its section out (logged on the server); when
// the newest listings themselves fail, the feed says so with a retry instead of looking like an empty marketplace. An
// empty marketplace shows the empty feed.
export default async function HomePage() {
  const banner = pickHomeBanner();
  const { supabase, deadline } = getRequestReads();
  if (!supabase) warnMissingSupabaseEnv();
  const { pool, priceDrops, total, categoryCounts, stores } = supabase
    ? await fetchHomeData(supabase, getListingCounts(optionalReadSignal(deadline)))
    : UNAVAILABLE;

  return (
    <>
      <JsonLd data={buildOrganizationJsonLd()} />
      <HomeBanner banner={banner} />
      <PageContainer className="flex flex-col gap-8 pb-8 pt-4 md:gap-12 md:pb-12 md:pt-6">
        <CategoryTiles counts={categoryCounts} />
        <HomeFollowedArrivals />
        {pool?.length ? <HomeForYou pool={pool} total={total} /> : pool ? <RecentListings /> : supabase ? <FeedUnavailable /> : null}
        {priceDrops?.length ? <PriceDropsSection listings={priceDrops} /> : null}
        <RecentlyViewed />
        <HowItWorks />
        {stores?.length ? <VerifiedStoresSection stores={stores} /> : null}
        <SellBlock />
      </PageContainer>
    </>
  );
}

// The newest listings could not be read (a database failure or the read's deadline): say so, never "no listings".
function FeedUnavailable() {
  return (
    <div role="alert" className={noticeClassName("danger")}>
      <NoticeIcon tone="danger" />
      <div className="min-w-0 flex-1">
        <p>No pudimos cargar las publicaciones. Vuelve a intentarlo en unos minutos.</p>
        <Link href="/" prefetch={false} className={buttonClasses({ variant: "secondary", size: "sm", className: "mt-3" })}>
          Reintentar
        </Link>
      </div>
    </div>
  );
}
