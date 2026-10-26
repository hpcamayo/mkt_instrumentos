import { getInstrumentFilterGroup } from "@/lib/instrument-filters";
import { getCategoryLabel } from "@/lib/listings";
import { absoluteUrl } from "@/lib/site";

// Feature ideas, batch "store-reach" (docs/feature-ideas/store-reach.md), reach-02 "Catálogo para redes": the product
// feeds. RSS 2.0 with Google's `g:` namespace, which both Meta Commerce Manager and Google Merchant Center read.
//   - "meta": one store's feed (app/api/feeds/tiendas/[slug]), which the store connects to its Meta catalog
//     (Instagram, Facebook, WhatsApp Business). Meta's availability values have spaces ("in stock").
//   - "google": all of Laria (app/api/feeds/laria), for Laria's own Merchant Center account, since Google only takes
//     products whose pages are on a domain the account owns. It adds the seller of each item (external_seller_id).
// Price and stock are read from the publication on every fetch, so the platforms stay in sync at their own schedule.

export type FeedFormat = "meta" | "google";

export type FeedItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  condition: string | null;
  price_pen: number | string;
  out_of_stock: boolean;
  category: string | null;
  instrument_type: string | null;
  seller_key: string;
  photos: string[];
};

export const FEED_PAGE_SIZE = 500;
export const FEED_MAX_ITEMS = 20_000;
export const FEED_CACHE_CONTROL = "public, max-age=0, s-maxage=3600, stale-while-revalidate=3600";

// XML 1.0 forbids most control characters even when escaped.
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string) {
  return value
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

// Google and Meta both take new, used and refurbished. Laria's conditions are "Nuevo" and the "Usado - …" family.
export function feedCondition(condition: string | null) {
  const value = (condition ?? "").toLowerCase();
  if (value.startsWith("nuevo")) return "new";
  if (value.includes("reacondicionado")) return "refurbished";
  return "used";
}

export function feedPrice(value: number | string) {
  return `${Number(value).toFixed(2)} PEN`;
}

export function feedPhotoUrl(url: string) {
  if (/^https:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return absoluteUrl(url);
  return null;
}

export function feedProductType(item: Pick<FeedItem, "category" | "instrument_type">) {
  const parts = [item.category ? getCategoryLabel(item.category) : null, item.instrument_type ? getInstrumentFilterGroup(item.instrument_type)?.label ?? null : null];
  return parts.filter(Boolean).join(" > ");
}

function element(name: string, value: string | null | undefined) {
  return value ? `<${name}>${escapeXml(value)}</${name}>` : "";
}

export function feedItemXml(item: FeedItem, format: FeedFormat) {
  const photos = item.photos.map(feedPhotoUrl).filter((url): url is string => Boolean(url));
  if (!photos.length || !(Number(item.price_pen) > 0)) return "";
  const title = clip(item.title, 150);
  const description = clip(item.description?.trim() || item.title, 5000);
  const availability = item.out_of_stock ? (format === "meta" ? "out of stock" : "out_of_stock") : format === "meta" ? "in stock" : "in_stock";
  return [
    "<item>",
    element("g:id", item.id),
    element("g:title", title),
    element("g:description", description),
    element("g:link", absoluteUrl(`/instrumentos/${item.slug}`)),
    element("g:image_link", photos[0]),
    ...photos.slice(1, 10).map((url) => element("g:additional_image_link", url)),
    element("g:availability", availability),
    element("g:price", feedPrice(item.price_pen)),
    element("g:condition", feedCondition(item.condition)),
    element("g:brand", item.brand),
    // Laria has no GTIN or manufacturer part number for its publications.
    element("g:identifier_exists", "no"),
    element("g:product_type", feedProductType(item)),
    format === "google" ? element("g:external_seller_id", item.seller_key) : "",
    "</item>",
  ].join("");
}

export function feedHead({ title, link, description }: { title: string; link: string; description: string }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>${element("title", title)}${element("link", link)}${element("description", description)}`;
}

export const FEED_TAIL = "</channel></rss>\n";

export function parseFeedItems(value: unknown): FeedItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is FeedItem => (
    Boolean(row) && typeof row === "object"
    && typeof (row as FeedItem).id === "string" && typeof (row as FeedItem).slug === "string"
    && typeof (row as FeedItem).title === "string" && typeof (row as FeedItem).seller_key === "string"
    && Array.isArray((row as FeedItem).photos)
  ));
}

// Streams the feed page by page (keyset on the item id). The first page is read before answering, so a failure there is
// a 503 the caller can return; a later failure aborts the stream, which leaves malformed XML that the platforms reject,
// so they keep their last good copy instead of deleting what the failed pages would have carried.
export async function feedStream(
  head: string,
  format: FeedFormat,
  fetchPage: (after: string | null) => Promise<FeedItem[] | null>,
): Promise<ReadableStream<Uint8Array> | null> {
  const first = await fetchPage(null);
  if (!first) return null;
  const encoder = new TextEncoder();
  let page: FeedItem[] = first;
  let sent = 0;
  let started = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(head));
      }
      if (!page.length) {
        controller.enqueue(encoder.encode(FEED_TAIL));
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(page.map((item) => feedItemXml(item, format)).join("\n")));
      sent += page.length;
      if (page.length < FEED_PAGE_SIZE || sent >= FEED_MAX_ITEMS) {
        page = [];
        return;
      }
      const next = await fetchPage(page[page.length - 1].id);
      if (!next) {
        controller.error(new Error("feed page failed"));
        return;
      }
      page = next;
    },
  });
}

// Store slugs are lowercase words joined by hyphens.
export function validFeedSlug(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(value);
}
