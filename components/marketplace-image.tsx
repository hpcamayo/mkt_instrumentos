import Image, { type ImageProps } from "next/image";

export function MarketplaceImage(props: ImageProps) {
  // Seed placeholders are small SVGs. Keep them direct; real photos use resizing.
  const isSeedPlaceholder =
    typeof props.src === "string" &&
    props.src.startsWith("https://placehold.co/");
  return <Image {...props} alt={props.alt} unoptimized={isSeedPlaceholder} />;
}
