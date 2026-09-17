import { NextResponse } from "next/server";
import { getMarketplaceSession, sameOriginEventRequest } from "@/lib/marketplace-events-server";

export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return new NextResponse(null, { status: 403 });
  try {
    await getMarketplaceSession();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return new NextResponse(null, { status: 503 }); }
}
