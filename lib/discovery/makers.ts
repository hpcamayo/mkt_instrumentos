// disc-04 "Hecho en Perú" and disc-05 "Equipo de artistas" (docs/feature-ideas/discovery.md): the marks a listing can
// carry, the maker and artist profiles, and their copy. Pure, so the pages, the forms and the tests share it.

export const MAKERS_PATH = "/hecho-en-peru";
export const ARTISTS_PATH = "/artistas";

export type MakerKind = "fabricante" | "taller";

export const MAKER_KIND_LABELS: Record<MakerKind, string> = {
  fabricante: "Fabricante",
  taller: "Taller",
};

export const MAKER_KIND_HINTS: Record<MakerKind, string> = {
  fabricante: "Fabricas instrumentos o equipos en Perú, en serie o por lotes.",
  taller: "Un luthier o un taller que hace instrumentos a mano, uno por uno.",
};

export type ListingMark = {
  listing_id: string;
  maker?: { kind: MakerKind; craft_city: string; store_name: string; store_slug: string };
  handmade?: boolean;
  made_to_order_weeks?: number;
  artist?: { display_name: string; slug: string };
  artist_note?: string;
};

export type PublicMaker = {
  store_id: string;
  store_name: string;
  store_slug: string;
  logo_url: string | null;
  is_verified: boolean;
  kind: MakerKind;
  craft_city: string;
  story: string | null;
  since_year: number | null;
  listing_ids: string[];
};

export type PublicArtist = {
  slug: string;
  display_name: string;
  story: string | null;
  link_url: string | null;
  listing_ids: string[];
};

export type GiftExchangeStore = {
  store_name: string;
  store_slug: string;
  city: string;
  is_verified: boolean;
  logo_url: string | null;
  exchange_days: number;
  note: string | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);
const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const isKind = (value: unknown): value is MakerKind => value === "fabricante" || value === "taller";

export function parseListingMarks(value: unknown): ListingMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): ListingMark[] => {
    if (!isRecord(row) || typeof row.listing_id !== "string") return [];
    const mark: ListingMark = { listing_id: row.listing_id };
    const maker = row.maker;
    if (isRecord(maker) && isKind(maker.kind) && text(maker.craft_city) && text(maker.store_name) && text(maker.store_slug)) {
      mark.maker = { kind: maker.kind, craft_city: String(maker.craft_city), store_name: String(maker.store_name), store_slug: String(maker.store_slug) };
    }
    if (row.handmade === true && mark.maker) mark.handmade = true;
    if (typeof row.made_to_order_weeks === "number" && mark.maker) mark.made_to_order_weeks = row.made_to_order_weeks;
    const artist = row.artist;
    if (isRecord(artist) && text(artist.display_name) && text(artist.slug)) {
      mark.artist = { display_name: String(artist.display_name), slug: String(artist.slug) };
      if (text(row.artist_note)) mark.artist_note = String(row.artist_note);
    }
    return [mark];
  });
}

export function parsePublicMakers(value: unknown): PublicMaker[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): PublicMaker[] => {
    if (!isRecord(row) || typeof row.store_id !== "string" || !text(row.store_name) || !text(row.store_slug) || !isKind(row.kind) || !text(row.craft_city)) return [];
    return [{
      store_id: row.store_id,
      store_name: String(row.store_name),
      store_slug: String(row.store_slug),
      logo_url: text(row.logo_url),
      is_verified: row.is_verified === true,
      kind: row.kind,
      craft_city: String(row.craft_city),
      story: text(row.story),
      since_year: typeof row.since_year === "number" ? row.since_year : null,
      listing_ids: ids(row.listing_ids),
    }];
  });
}

export function parsePublicArtists(value: unknown): PublicArtist[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): PublicArtist[] => {
    if (!isRecord(row) || !text(row.slug) || !text(row.display_name)) return [];
    const link = text(row.link_url);
    return [{
      slug: String(row.slug),
      display_name: String(row.display_name),
      story: text(row.story),
      link_url: link && /^https:\/\//.test(link) ? link : null,
      listing_ids: ids(row.listing_ids),
    }];
  });
}

export function parseGiftExchangeStores(value: unknown): GiftExchangeStore[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): GiftExchangeStore[] => {
    if (!isRecord(row) || !text(row.store_name) || !text(row.store_slug) || typeof row.exchange_days !== "number") return [];
    return [{
      store_name: String(row.store_name),
      store_slug: String(row.store_slug),
      city: text(row.city) ?? "",
      is_verified: row.is_verified === true,
      logo_url: text(row.logo_url),
      exchange_days: row.exchange_days,
      note: text(row.note),
    }];
  });
}

// "Hecho a mano en Ayacucho" (a taller) or "Hecho en Ayacucho" (a fabricante, which may not work by hand).
export function handmadeLabel(maker: { kind: MakerKind; craft_city: string }) {
  return maker.kind === "taller" ? `Hecho a mano en ${maker.craft_city}` : `Hecho en ${maker.craft_city}`;
}

export function madeToOrderLabel(weeks: number) {
  return `Se hace a pedido: ${weeks === 1 ? "1 semana" : `${weeks} semanas`}`;
}

export function giftExchangeLabel(days: number) {
  return `Acepta cambios de regalos por ${days} días`;
}

// Whose word each mark is (guardrail: Laria never vouches for provenance or use).
export const MAKER_DISCLAIMER = "Lo declara la tienda. Laria no verifica cómo ni dónde se hizo el instrumento.";
export const ARTIST_DISCLAIMER = "Laria comprobó la identidad del artista. Lo que cuenta sobre el uso del equipo es palabra de quien vende.";
export const GIFT_EXCHANGE_DISCLAIMER = "El cambio lo ofrece cada tienda, con sus propias condiciones. Confírmalo con ella antes de comprar.";
