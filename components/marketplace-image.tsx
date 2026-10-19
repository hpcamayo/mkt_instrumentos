"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { dataSavingScale, scaleImageSizes, useReducedData } from "@/lib/data-saver";

// fast-03 (docs/ux-effortless/speed.md): when the phone asks to save data or the connection is slow, an image that
// appears after the page has loaded (the next page, a gallery, more results) asks for about 1.5 device pixels per CSS
// pixel instead of the screen's full density. The choice is fixed at the image's first render, so an image the server
// already sent never downloads twice, and the smaller files are ones Next already serves to other screens.
export function MarketplaceImage(props: ImageProps) {
  const reducedNow = useReducedData();
  const [reduced] = useState(reducedNow);
  // Seed placeholders are small SVGs. Keep them direct; real photos use resizing.
  const isSeedPlaceholder =
    typeof props.src === "string" &&
    props.src.startsWith("https://placehold.co/");
  const sizes = reduced && !isSeedPlaceholder ? dataSavingSizes(props) : props.sizes;
  return <Image {...props} sizes={sizes} alt={props.alt} unoptimized={isSeedPlaceholder} />;
}

function dataSavingSizes({ sizes, width, fill }: ImageProps) {
  const scale = dataSavingScale(window.devicePixelRatio || 1);
  if (scale >= 1) return sizes;
  if (sizes) return scaleImageSizes(sizes, scale);
  const pixels = Number(width);
  return !fill && Number.isFinite(pixels) && pixels > 0 ? `${Math.ceil(pixels * scale)}px` : undefined;
}
