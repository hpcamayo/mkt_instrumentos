import { NextResponse } from "next/server";
import { FEED_CACHE_CONTROL, FEED_PAGE_SIZE, feedHead, feedStream, parseFeedItems, validFeedSlug } from "@/lib/store-feed";
import { absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { storeReachDb } from "@/lib/store-reach-db";
import { getPublicSupabaseClient } from "@/lib/supabase/public-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-02 "Catálogo para redes" (docs/feature-ideas/store-reach.md): one store's feed for its Meta catalog. It exists
// only while the store has it on and is active; otherwise 404. Public data only, read with the anonymous key, cached
// by the CDN for an hour. Preview deployments never serve it, so a platform cannot pick up a preview's copy.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isIndexableDeployment() || !validFeedSlug(slug)) return notFound();
  const client = getPublicSupabaseClient();
  if (!client) return unavailable();
  const db = storeReachDb(client);
  const { data: header, error } = await db.rpc("get_store_feed_header", { p_store_slug: slug });
  if (error) return unavailable();
  if (!header || typeof header !== "object" || typeof (header as { name?: unknown }).name !== "string") return notFound();
  const name = (header as { name: string }).name;
  const stream = await feedStream(
    feedHead({ title: `${name} en Laria`, link: absoluteUrl(`/tiendas/${slug}`), description: `Instrumentos de ${name} publicados en Laria.` }),
    "meta",
    async (after) => {
      const { data, error: pageError } = await db.rpc("get_feed_items", { p_store_slug: slug, p_after: after, p_limit: FEED_PAGE_SIZE });
      return pageError ? null : parseFeedItems(data);
    },
  );
  if (!stream) return unavailable();
  return new Response(stream, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": FEED_CACHE_CONTROL, "X-Robots-Tag": "noindex" },
  });
}

function notFound() {
  return NextResponse.json({ message: "Este catálogo no existe o no está activo." }, { status: 404, headers: { "Cache-Control": "public, s-maxage=300" } });
}

function unavailable() {
  return NextResponse.json({ message: "El catálogo no está disponible en este momento." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
