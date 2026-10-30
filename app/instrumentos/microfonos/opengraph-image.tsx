import { getCategoryLandingBySlug } from "@/lib/category-pages";
import { CategoryCard, OG_SIZE, renderShareImage } from "@/lib/share-image";

export const size = OG_SIZE;
export const contentType = "image/png";
export default function OpenGraphImage() {
  return renderShareImage(<CategoryCard landing={getCategoryLandingBySlug("microfonos")!} />, OG_SIZE, "public, max-age=86400, s-maxage=86400");
}
