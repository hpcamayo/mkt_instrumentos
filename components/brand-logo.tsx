import Image from "next/image";
import logoClear from "@/app/logo-clear.svg";
import { cn } from "@/lib/utils";

// The wordmark spans the full width of app/logo-clear.svg's 1400×980 artboard and its middle 537 units.
// Logo sizes (docs/design-system.md) are boxes of about 1.9:1, as the logo is drawn on the design canvas:
// object-cover scales the artboard to the box width and crops the empty band above and below the letters.
const SIZES = {
  // Header: 32 px tall on phones, 36 px from 768 px.
  header: "h-8 w-[61px] md:h-9 md:w-[68px]",
  // Full footer: 24 px on phones, 28 px from 768 px.
  footer: "h-6 w-[45px] md:h-7 md:w-[53px]",
  // Admin sidebar and bar.
  admin: "h-7 w-[53px]",
} as const;

export function BrandLogo({ size, priority = false, className }: { size: keyof typeof SIZES; priority?: boolean; className?: string }) {
  return (
    <Image
      src={logoClear}
      alt="Laria"
      priority={priority}
      className={cn("block object-cover", SIZES[size], className)}
    />
  );
}
