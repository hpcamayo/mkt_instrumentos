import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

// Launch audit A19: the check page of app/api/internal/public-pages/refresh. Cached until it is cleared, and cleared only
// together with every cached listing page and the home (lib/listing-cache.ts), so a new nonce shows the job that one of
// its clears reached the cache. It says nothing else.
export const dynamic = "force-static";
export const revalidate = false;

export function GET() {
  return NextResponse.json({ nonce: randomUUID() });
}
