import { NextResponse } from "next/server";

const MAX_REPORT_BYTES = 16_384;

// Launch audit A11: the browser's Content-Security-Policy violation reports (report-uri in lib/security-headers.ts).
// One compact log line per report, so a blocked resource shows up in the Vercel logs; nothing is stored, and the page
// address is logged without its query string, which can carry tokens.
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  const text = await readReport(request);
  if (text === null) return new NextResponse(null, { status: 413 });
  try {
    const parsed = JSON.parse(text);
    const report = parsed?.["csp-report"] ?? (Array.isArray(parsed) ? parsed[0]?.body : parsed?.body) ?? {};
    console.warn("csp-violation", JSON.stringify({
      directive: String(report["effective-directive"] ?? report["violated-directive"] ?? report.effectiveDirective ?? "").slice(0, 80),
      blocked: withoutQuery(report["blocked-uri"] ?? report.blockedURL),
      page: withoutQuery(report["document-uri"] ?? report.documentURL),
    }));
  } catch {
    // Not a report; nothing to log.
  }
  return new NextResponse(null, { status: 204 });
}

// A report is a few hundred bytes. Reading stops as soon as a body passes the limit (null), whether or not it declared a
// Content-Length, so an oversized or endless body is never buffered.
async function readReport(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength;
      if (size > MAX_REPORT_BYTES) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } catch {
    return "";
  }
  return text + decoder.decode();
}

function withoutQuery(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, 200);
  } catch {
    return value.slice(0, 40);
  }
}
