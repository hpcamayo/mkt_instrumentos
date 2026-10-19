import { NextResponse } from "next/server";
import { STORY_SIZE, StoryCard, loadShareListing, renderShareImage } from "@/lib/share-image";

// The 1080x1920 image for WhatsApp Status (Effortless list-08, "Descargar imagen para estados" / "Compartir
// imagen"): the photo large, title, price, condition, badges and the site's address. Only public listings have one.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const listing = await loadShareListing(slug);
    if (!listing) return new NextResponse("Not Found", { status: 404, headers: { "cache-control": "public, max-age=60" } });
    return renderShareImage(<StoryCard listing={listing} />, STORY_SIZE, "public, max-age=300");
  } catch (error) {
    console.error("[story] image failed", error);
    return new NextResponse("Error", { status: 500 });
  }
}
