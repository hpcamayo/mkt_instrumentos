import { NextResponse } from "next/server";
import { browserFamily, parseClientErrorReport, recordAppError } from "@/lib/monitoring/record-error";
import { RATE_LIMITS, checkRequest } from "@/lib/rate-limit";
import { readBodyWithLimit } from "@/lib/request-body";

const MAX_REPORT_BYTES = 4_096;

// Launch audit A13: an error in a visitor's browser (lib/monitoring/client-errors.ts), counted like the server's for
// Admin > Errores. Only Laria's own pages may send one (A22, middleware), each visitor at most 30 every 10 minutes,
// and the database keeps no account, address or IP (public.record_app_error).
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  const text = await readBodyWithLimit(request, MAX_REPORT_BYTES);
  if (text === null) return new NextResponse(null, { status: 413 });
  const report = parseClientErrorReport(text);
  if (!report) return new NextResponse(null, { status: 400 });
  if ((await checkRequest(RATE_LIMITS.clientErrors, request)) === "limited") return new NextResponse(null, { status: 429 });
  await recordAppError({ source: "browser", ...report, client: browserFamily(request.headers.get("user-agent")) });
  return new NextResponse(null, { status: 204 });
}
