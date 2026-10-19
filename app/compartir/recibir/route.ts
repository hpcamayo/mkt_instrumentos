import { NextResponse } from "next/server";

// big-12: the share target's address. The service worker (public/sw.js) answers it on the phone and keeps the photos
// there. This only runs when the worker is not active yet (the first share right after installing): the photos are
// not uploaded anywhere, and /compartir explains that nothing arrived.
export function POST(request: Request) {
  return NextResponse.redirect(new URL("/compartir?fotos=0", request.url), 303);
}

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/compartir", request.url), 303);
}
