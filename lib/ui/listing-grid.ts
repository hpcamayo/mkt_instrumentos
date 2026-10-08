// The catalog and landing grid (docs/ux-redesign/ux-3-discovery.md § Grid sizes): two columns on phones, three from
// 768 px, four from 1280 px (beside the 272 px filters); column gaps 12 / 20 px, row gaps 24 / 32 px. Kept out of the
// card's client module so server pages can read the strings.
export const LISTING_GRID = "grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 md:gap-y-8 xl:grid-cols-4";
export const LISTING_GRID_SIZES = "(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 300px";
