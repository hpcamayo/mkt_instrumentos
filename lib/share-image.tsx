import "server-only";

import { ImageResponse } from "next/og";
import type { ReactElement, ReactNode } from "react";
import type { CategoryLandingPage } from "@/lib/category-pages";
import { getConditionLabel, isOutOfStock, normalizeStore, type ListingCardData } from "@/lib/listings";
import { formatPrice } from "@/lib/price";
import { DEFAULT_SITE_URL, absoluteUrl } from "@/lib/site";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { READ_BUDGETS, budgetSignal, createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// Share images (Effortless list-09 and list-08): the link preview WhatsApp, Facebook and X show (1200x630) and the
// WhatsApp Status image (1080x1920), drawn with next/og (satori) in its bundled Noto Sans, which has every Spanish
// accent. Colours are the frame black and the action yellow of tailwind.config.ts. Nothing is fetched from outside
// Laria except the listing's own photo, and any failure falls back to the generic Laria card.

export const OG_SIZE = { width: 1200, height: 630 };
export const STORY_SIZE = { width: 1080, height: 1920 };
export const SITE_TAGLINE = "El mercado de instrumentos del Perú";

const BLACK = "#050608";
const FRAME_2 = "#1A1D24";
const YELLOW = "#F1EA16";
const WHITE = "#FFFFFF";
const MUTED = "#9DA3AF";
const BLUE = "#6BA6FF";
const DOMAIN = new URL(DEFAULT_SITE_URL).host;

export type ShareListing = {
  title: string;
  price: string;
  condition: string | null;
  verifiedStore: boolean;
  state: "available" | "sold" | "out_of_stock";
  photo: string | null;
};

type ListingRow = Pick<ListingCardData, "id" | "title" | "slug" | "price_pen" | "condition" | "stores"> & {
  status: "approved" | "sold";
  stock_state: ListingCardData["stock_state"];
  listing_photos: { image_url: string; sort_order: number }[] | null;
};

// The listing exactly as its page shows it to the public: approved and public (listing_is_public), or sold with a
// store that is still active. Anything else is null, as the page's notFound().
export async function loadShareListing(slug: string, { withPhoto = true } = {}): Promise<ShareListing | null> {
  const admin = getSupabaseAdminClient();
  const deadline = createDeadline(READ_BUDGETS.pageMs);
  const publicClient = createPublicReadClient(deadline);
  if (!admin || !publicClient) return null;
  const { data, error } = await admin
    .from("listings")
    .select("id, status, stock_state, title, slug, price_pen, condition, stores ( name, slug, status, is_verified ), listing_photos ( image_url, sort_order )")
    .in("status", ["approved", "sold"])
    .eq("slug", slug)
    .order("sort_order", { foreignTable: "listing_photos", ascending: true })
    .limit(1, { foreignTable: "listing_photos" })
    .retry(false)
    .abortSignal(budgetSignal(deadline, READ_BUDGETS.coreMs))
    .maybeSingle()
    .returns<ListingRow>();
  if (error || !data) return null;
  const store = normalizeStore(data as unknown as ListingCardData);
  if (data.status === "sold" && store?.status && store.status !== "active") return null;
  if (data.status === "approved") {
    const { data: isPublic } = await publicClient.rpc("listing_is_public", { p_listing_id: data.id });
    if (!isPublic) return null;
  }
  const first = data.listing_photos?.[0]?.image_url ?? null;
  return {
    title: data.title,
    price: formatPrice(data.price_pen),
    condition: data.condition ? getConditionLabel(data.condition) : null,
    verifiedStore: store?.is_verified === true && store.status === "active",
    state: data.status === "sold" ? "sold" : isOutOfStock(data) ? "out_of_stock" : "available",
    photo: withPhoto && first ? await loadPhoto(first) : null,
  };
}

// The photo as a data URI satori can draw (PNG, JPEG, GIF or SVG). Stored photos may be WebP, which satori cannot
// read, so the photo is asked first from Next's image optimizer as JPEG at 1080 px (also smaller), then directly.
// Relative paths resolve against the site URL. Null when nothing usable arrives within three seconds.
export async function loadPhoto(src: string): Promise<string | null> {
  let absolute: string;
  try {
    absolute = /^https?:\/\//.test(src) ? src : absoluteUrl(src);
  } catch {
    return null;
  }
  const candidates = [absoluteUrl(`/_next/image?url=${encodeURIComponent(src)}&w=1080&q=80`), absolute];
  // One budget for both tries: link previews are fetched by crawlers that give up after a few seconds.
  const signal = AbortSignal.timeout(3000);
  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { accept: "image/jpeg,image/png;q=0.9,image/svg+xml;q=0.5" }, signal });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const type = sniffImage(bytes);
      if (type) return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
    } catch {
      // Try the next source.
    }
  }
  return null;
}

export function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

function clip(text: string, max: number) {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: "flex", color: YELLOW, fontSize: size, fontWeight: 700, letterSpacing: -size * 0.03, lineHeight: 1 }}>
      Laria
    </div>
  );
}

function Pill({ children, tone }: { children: ReactNode; tone: "verified" | "sold" | "out" }) {
  const styles = {
    verified: { color: BLUE, border: `3px solid ${BLUE}`, background: "transparent" },
    sold: { color: BLACK, border: `3px solid ${WHITE}`, background: WHITE },
    out: { color: WHITE, border: `3px solid ${MUTED}`, background: "transparent" },
  }[tone];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 18px", borderRadius: 999, fontSize: 26, ...styles }}>
      {tone === "verified" ? <Check color={BLUE} /> : null}
      {children}
    </div>
  );
}

function Check({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Badges({ listing }: { listing: ShareListing }) {
  if (listing.state === "available" && !listing.verifiedStore) return null;
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {listing.state === "sold" ? <Pill tone="sold">Vendido</Pill> : null}
      {listing.state === "out_of_stock" ? <Pill tone="out">Agotado</Pill> : null}
      {listing.verifiedStore ? <Pill tone="verified">Tienda verificada</Pill> : null}
    </div>
  );
}

function PhotoPanel({ src, width, height, radius }: { src: string; width: number; height: number; radius: number }) {
  return (
    <div style={{ display: "flex", width, height, borderRadius: radius, background: WHITE, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- satori draws plain <img> elements */}
      <img src={src} alt="" width={width} height={height} style={{ width, height, objectFit: "contain" }} />
    </div>
  );
}

export function GenericCard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: BLACK, color: WHITE }}>
      <div style={{ display: "flex", width: 120, height: 10, background: YELLOW, borderRadius: 5 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <Wordmark size={180} />
        <div style={{ display: "flex", fontSize: 52, lineHeight: 1.2, color: WHITE }}>{SITE_TAGLINE}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: MUTED }}>
        <div style={{ display: "flex" }}>Compra y vende con contacto directo por WhatsApp</div>
        <div style={{ display: "flex", color: WHITE }}>{DOMAIN}</div>
      </div>
    </div>
  );
}

export function CategoryCard({ landing }: { landing: CategoryLandingPage }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", padding: 72, background: BLACK, color: WHITE }}>
      <Wordmark size={64} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 104, lineHeight: 1.05, letterSpacing: -2 }}>{clip(landing.label, 28)}</div>
        <div style={{ display: "flex", fontSize: 64, lineHeight: 1.1, color: YELLOW }}>en Laria</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: MUTED }}>
        <div style={{ display: "flex" }}>Particulares y tiendas de todo el Perú</div>
        <div style={{ display: "flex", color: WHITE }}>{DOMAIN}</div>
      </div>
    </div>
  );
}

export function ListingCard({ listing }: { listing: ShareListing }) {
  const sold = listing.state === "sold";
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", padding: 40, gap: 48, background: BLACK, color: WHITE }}>
      {listing.photo ? <PhotoPanel src={listing.photo} width={550} height={550} radius={16} /> : null}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: listing.photo ? "12px 0" : "32px" }}>
        <Wordmark size={56} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: listing.photo ? 48 : 64, lineHeight: 1.15 }}>{clip(listing.title, listing.photo ? 70 : 90)}</div>
          <div style={{ display: "flex", fontSize: listing.photo ? 64 : 80, lineHeight: 1, color: sold ? MUTED : YELLOW }}>{listing.price}</div>
          {listing.condition ? <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{listing.condition}</div> : null}
          <Badges listing={listing} />
        </div>
        <div style={{ display: "flex", fontSize: 28, color: MUTED }}>{DOMAIN}</div>
      </div>
    </div>
  );
}

export function StoryCard({ listing }: { listing: ShareListing }) {
  const sold = listing.state === "sold";
  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "96px 64px", gap: 56, background: BLACK, color: WHITE }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <Wordmark size={88} />
        <div style={{ display: "flex", fontSize: 30, color: MUTED }}>{SITE_TAGLINE}</div>
      </div>
      {listing.photo ? (
        <PhotoPanel src={listing.photo} width={952} height={952} radius={28} />
      ) : (
        <div style={{ display: "flex", width: 952, height: 400, borderRadius: 28, background: FRAME_2, alignItems: "center", justifyContent: "center", fontSize: 40, color: MUTED }}>
          Sin foto
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 28, flex: 1 }}>
        <div style={{ display: "flex", fontSize: 64, lineHeight: 1.15 }}>{clip(listing.title, 80)}</div>
        <div style={{ display: "flex", fontSize: 104, lineHeight: 1, color: sold ? MUTED : YELLOW }}>{listing.price}</div>
        {listing.condition ? <div style={{ display: "flex", fontSize: 40, color: MUTED }}>{listing.condition}</div> : null}
        <Badges listing={listing} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center", fontSize: 40 }}>
        <div style={{ display: "flex", color: MUTED }}>Encuéntralo en</div>
        <div style={{ display: "flex", color: WHITE, fontSize: 56 }}>{DOMAIN}</div>
      </div>
    </div>
  );
}

// Five minutes in browsers, an hour at the CDN: a new price or "Vendido" reaches previews soon, and the image is not
// drawn again for every visitor.
export const SHARE_IMAGE_CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export function renderShareImage(element: ReactElement, size: { width: number; height: number }, cacheControl = SHARE_IMAGE_CACHE) {
  return new ImageResponse(element, { ...size, headers: { "cache-control": cacheControl } });
}
