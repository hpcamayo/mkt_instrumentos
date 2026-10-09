import { Search } from "lucide-react";
import { preload } from "react-dom";
import { PageContainer } from "@/components/page-container";
import { buttonClasses } from "@/components/ui/button";
import { BANNER_DESKTOP_MEDIA, BANNER_PHONE_MEDIA, densitySrcSet, type HomeBanner as Banner } from "@/lib/home-banner";
import { CATALOG_PATH, SEARCH_LABEL, SEARCH_PLACEHOLDER } from "@/lib/shell";

// The home banner (docs/ux-redesign/ux-3-discovery.md § Banner; H6, H7, H9–H11, N8; audit items 2, 6, 13, 17): the piece
// chosen for this request (lib/home-banner.ts), the headline, the lead and the brand search. Desktop: a 300 px band with
// the art behind the centred text. Phones: the 390×150 art strip, then the text on frame black, the art fading into it
// over 40 px (Q16 A). Every height is fixed, so nothing shifts when the image arrives. The art is decorative (alt="").
export function HomeBanner({ banner }: { banner: Banner }) {
  // Only this piece is preloaded, one file per viewport: the media queries match the <picture> sources.
  preload(banner.desktop.webp1x, { as: "image", type: "image/webp", imageSrcSet: densitySrcSet(banner.desktop), media: BANNER_DESKTOP_MEDIA, fetchPriority: "high" });
  preload(banner.phone.webp1x, { as: "image", type: "image/webp", imageSrcSet: densitySrcSet(banner.phone), media: BANNER_PHONE_MEDIA, fetchPriority: "high" });

  return (
    <section aria-labelledby="inicio-titulo" className="surface-frame relative bg-frame text-surface md:h-[300px]" data-banner={banner.id}>
      <div className="relative aspect-[390/150] w-full overflow-hidden md:absolute md:inset-0 md:aspect-auto md:h-full">
        <picture>
          <source media={BANNER_DESKTOP_MEDIA} type="image/webp" srcSet={densitySrcSet(banner.desktop)} />
          <source media={BANNER_PHONE_MEDIA} type="image/webp" srcSet={densitySrcSet(banner.phone)} />
          <source media={BANNER_PHONE_MEDIA} srcSet={banner.phone.jpeg} />
          {/* Plain <img>: the files are already sized and compressed WebP, and next/image cannot art-direct. */}
          <img src={banner.desktop.jpeg} alt="" width={1440} height={300} fetchPriority="high" decoding="async" className="h-full w-full object-cover object-center" />
        </picture>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-frame/0 to-frame md:hidden" />
      </div>

      {/* Centred on the page axis, lifted 13 px above the band's middle (the optical centre). */}
      <PageContainer className="relative flex flex-col items-center pb-6 pt-1 text-center md:h-full md:justify-center md:pb-[26px] md:pt-0">
        <h1 id="inicio-titulo" className="t-display max-md:text-[28px] max-md:leading-8">El mercado de instrumentos del Perú</h1>
        <p className="text-lead mt-2 text-[14px] leading-5 text-line-deco md:text-[16px] md:leading-6">
          Nuevos y usados, de músicos y tiendas de todo el país.
        </p>
        <BannerSearch />
      </PageContainer>
    </section>
  );
}

// The header search's GET form (brand to /listados), in the banner's size: a 56 px box with a 44 px "Explorar" on
// phones, 64 px with a 52 px "Explorar" at a 6 px inset from 768 px. It records nothing itself: the catalog records one
// search per real search (PUB-009, AN-004).
function BannerSearch() {
  return (
    <form action={CATALOG_PATH} method="get" role="search" className="mt-5 w-full max-w-[640px] md:mt-6">
      <label className="sr-only" htmlFor="busqueda-inicio">{SEARCH_LABEL}</label>
      <div className="surface-light flex h-14 items-center gap-2 rounded-panel bg-surface pl-4 pr-1.5 text-ink md:h-16 md:gap-3 md:pl-5">
        <Search aria-hidden="true" className="h-5 w-5 shrink-0 text-ink-2" />
        <input
          id="busqueda-inicio"
          name="brand"
          type="search"
          maxLength={200}
          placeholder={SEARCH_PLACEHOLDER}
          className="h-11 min-w-0 flex-1 rounded-tag bg-transparent text-[16px] text-ink placeholder:text-ink-3"
        />
        <button type="submit" className={buttonClasses({ variant: "primary", size: "lg", className: "max-md:h-11 max-md:px-4 max-md:text-[16px]" })}>
          Explorar
        </button>
      </div>
    </form>
  );
}
