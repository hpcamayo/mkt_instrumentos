// The home banner rotation (decisions H7, H9–H11; docs/ux-redesign/art/rotation/ holds the manifest, the rules and the
// generators). Nine decided pieces, one per visit, picked on the server so only that piece is in the HTML and loads.
// The files are served from public/banners/: desktop 1440×300 and 2880×600, phone 390×150 and 780×300, WebP with a
// JPEG fallback at 2x.
const PIECES = [
  ["01", "diablada", "Diablada"],
  ["02", "trompeta-tuba", "Trompeta y tuba"],
  ["03", "bombo-platillos", "Bombo y platillos"],
  ["04", "trombon-saxo", "Trombón y saxo"],
  ["05", "tarola-clarinetes", "Tarola y clarinetes"],
  ["06", "waqrapuku-tinya", "Waqrapuku y tinya"],
  ["07", "siku-quena", "Siku y quena"],
  ["08", "charango-cajon", "Charango y cajón"],
  ["09", "guitarra-amplificador", "Guitarra y amplificador"],
] as const;

export type BannerFiles = { webp1x: string; webp2x: string; jpeg: string };
export type HomeBanner = { id: string; title: string; desktop: BannerFiles; phone: BannerFiles };

const files = (name: string): BannerFiles => ({
  webp1x: `/banners/${name}.webp`,
  webp2x: `/banners/${name}@2x.webp`,
  jpeg: `/banners/${name}@2x.jpg`,
});

export const HOME_BANNERS: readonly HomeBanner[] = PIECES.map(([number, id, title]) => ({
  id,
  title,
  desktop: files(`${number}-${id}-desktop`),
  phone: files(`${number}-${id}-phone`),
}));

// The phone art is 390×150 at every phone width; desktop art fills a 300 px band (object-fit: cover).
export const BANNER_PHONE_RATIO = "390 / 150";
export const BANNER_DESKTOP_MEDIA = "(min-width: 768px)";
export const BANNER_PHONE_MEDIA = "(max-width: 767px)";

// One piece per visit (H11): a uniform pick from a number in [0, 1).
export function pickHomeBanner(random: number = Math.random()): HomeBanner {
  const index = Math.min(HOME_BANNERS.length - 1, Math.max(0, Math.floor(random * HOME_BANNERS.length)));
  return HOME_BANNERS[index];
}

export const densitySrcSet = (set: BannerFiles) => `${set.webp1x} 1x, ${set.webp2x} 2x`;
