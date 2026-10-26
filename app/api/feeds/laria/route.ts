import { NextResponse } from "next/server";
import { FEED_CACHE_CONTROL, FEED_PAGE_SIZE, feedHead, feedStream, parseFeedItems } from "@/lib/store-feed";
import { SITE_DESCRIPTION, absoluteUrl, isIndexableDeployment } from "@/lib/site";
import { storeReachDb } from "@/lib/store-reach-db";
import { createDeadline } from "@/lib/request-deadline";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-02 "Catálogo para redes" (docs/feature-ideas/store-reach.md): every public publication of Laria, for Laria's
// own Google Merchant Center account (free listings in the Shopping tab). Each item names its seller
// (external_seller_id). Public data only, read with the anonymous key, cached by the CDN for an hour; preview
// deployments never serve it.
export async function GET() {
  if (!isIndexableDeployment()) return NextResponse.json({ message: "Este catálogo no existe." }, { status: 404 });
  // The deadline-bound public client: the whole feed within 50 s, each page of 500 within 8 s, no automatic retries.
  const client = createPublicReadClient(createDeadline(50_000), 8_000);
  if (!client) return unavailable();
  const db = storeReachDb(client);
  const stream = await feedStream(
    feedHead({ title: "Laria", link: absoluteUrl("/"), description: SITE_DESCRIPTION }),
    "google",
    async (after) => {
      const { data, error } = await db.rpc("get_feed_items", { p_store_slug: null, p_after: after, p_limit: FEED_PAGE_SIZE });
      return error ? null : parseFeedItems(data);
    },
  );
  if (!stream) return unavailable();
  return new Response(stream, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": FEED_CACHE_CONTROL, "X-Robots-Tag": "noindex" },
  });
}

function unavailable() {
  return NextResponse.json({ message: "El catálogo no está disponible en este momento." }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
