import { CategoriesSection } from "@/components_v0/categories-section";
import { CTASection } from "@/components_v0/cta-section";
import {
  FeaturedListings,
  type FeaturedListing,
} from "@/components_v0/featured-listings";
import { HeroSection } from "@/components_v0/hero-section";
import { TrustSection } from "@/components_v0/trust-section";
import {
  VerifiedStores,
  type VerifiedStore,
} from "@/components_v0/verified-stores";
import {
  categoryOptions,
  formatPrice,
  normalizeStore,
  type ListingCardData,
} from "@/lib/listings";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";

type StorePreviewData = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string;
  district: string | null;
  logo_url: string | null;
};

export default async function HomePage() {
  const supabase = getPublicSupabaseClient();
  let listings: ListingCardData[] = [];
  let stores: StorePreviewData[] = [];

  if (supabase) {
    const [{ data: listingRows }, { data: storeRows }] = await Promise.all([
      supabase
        .from("listings")
        .select(
          `
            id,
            title,
            slug,
            category,
            brand,
            model,
            condition,
            price_pen,
            instrument_type,
            attributes,
            published_at,
            view_count,
            city,
            region,
            seller_type,
            created_at,
            stores (
              name,
              slug,
              status,
              is_verified
            ),
            listing_photos (
              id,
              listing_id,
              image_url,
              alt_text,
              sort_order
            )
          `,
        )
        .eq("status", "approved")
        .order("created_at", { ascending: false })
        .order("sort_order", {
          foreignTable: "listing_photos",
          ascending: true,
        })
        .limit(1, { foreignTable: "listing_photos" })
        .limit(8),
      supabase
        .from("stores")
        .select(
          `
            id,
            name,
            slug,
            description,
            city,
            district,
            logo_url
          `,
        )
        .eq("status", "active")
        .eq("is_verified", true)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    listings = (listingRows ?? []) as ListingCardData[];
    stores = (storeRows ?? []) as StorePreviewData[];
  }

  return (
    <>
      <HeroSection />
      <CategoriesSection categories={[...categoryOptions]} />
      <FeaturedListings listings={toFeaturedListings(listings)} />
      <VerifiedStores stores={toVerifiedStores(stores)} />
      <TrustSection />
      <CTASection />
    </>
  );
}

function toFeaturedListings(listings: ListingCardData[]): FeaturedListing[] {
  return listings.map((listing) => {
    const store = normalizeStore(listing);
    const photo = listing.listing_photos[0];

    return {
      id: listing.id,
      title: listing.title,
      slug: listing.slug,
      price: formatPrice(listing.price_pen),
      location: `${listing.city}, ${listing.region}`,
      imageUrl: photo?.image_url ?? null,
      imageAlt: photo?.alt_text ?? listing.title,
      isVerifiedStore:
        listing.seller_type === "store" && store?.is_verified === true,
    };
  });
}

function toVerifiedStores(stores: StorePreviewData[]): VerifiedStore[] {
  return stores.map((store) => ({
    id: store.id,
    name: store.name,
    slug: store.slug,
    logoUrl: store.logo_url,
    location: [store.district, store.city].filter(Boolean).join(", "),
    description:
      store.description ??
      "Tienda activa con productos revisados dentro del marketplace.",
  }));
}
