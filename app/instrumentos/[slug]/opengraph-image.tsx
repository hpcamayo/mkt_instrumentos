import { getCategoryLandingBySlug } from "@/lib/category-pages";
import { CategoryCard, GenericCard, ListingCard, OG_SIZE, loadShareListing, renderShareImage } from "@/lib/share-image";

// The link preview of a listing or a category landing (Effortless list-09): the listing's first photo, title, price,
// condition and "Tienda verificada" ("Vendido" once sold); a category's name "en Laria". Anything it cannot read
// becomes the generic Laria card, never an error.
export const alt = "Publicación en Laria, el mercado de instrumentos del Perú";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpenGraphImage({ params }: { params: { slug: string } }) {
  try {
    const { slug } = await Promise.resolve(params);
    const landing = getCategoryLandingBySlug(slug);
    if (landing) return renderShareImage(<CategoryCard landing={landing} />, OG_SIZE, "public, max-age=86400, s-maxage=86400");
    const listing = await loadShareListing(slug);
    if (listing) return renderShareImage(<ListingCard listing={listing} />, OG_SIZE);
  } catch (error) {
    console.error("[og] listing image failed", error);
  }
  return renderShareImage(<GenericCard />, OG_SIZE);
}
