import { GenericCard, OG_SIZE, renderShareImage } from "@/lib/share-image";

// The Laria link preview for every page without its own (Effortless list-09).
export const alt = "Laria, el mercado de instrumentos del Perú";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return renderShareImage(<GenericCard />, OG_SIZE, "public, max-age=86400, s-maxage=86400");
}
