import { timingSafeEqual } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { NextResponse } from "next/server";
import { CACHE_PROBE_PATH, currentDeployment, dropCachedListingPages } from "@/lib/listing-cache";
import { absoluteUrl } from "@/lib/site";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
// The cache's own copy: a hit, a copy just built, or the one from the build. A stale copy served while it rebuilds isn't.
const CURRENT_COPY = new Set(["HIT", "MISS", "PRERENDER"]);
const NONCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Launch audit A19: runs every minute (vercel.json), CRON_SECRET-protected like the e-mail worker. Every change to what
// the cached public pages show is recorded in the database, whichever path made it
// (supabase/migrations/20261112130000_launch_audit_page_refresh.sql, which explains the steps). While changes wait,
// each run claims them, reads the check page's nonce, reports it, and clears every cached listing page, the home and the
// check page (lib/listing-cache.ts). A change is done once a later run in the same deployment reads a new nonce; a run
// that fails anywhere leaves its changes to the next one. A quiet minute does one database call and clears nothing.
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ message: "No autorizado." }, { status: 401, headers: NO_STORE });
  const client = getSupabaseAdminClient();
  if (!client) return NextResponse.json({ message: "Configuración incompleta." }, { status: 503, headers: NO_STORE });
  const db = client as unknown as import("@supabase/supabase-js").SupabaseClient;

  // A deploy or a rollback serves pages from its build or its own past, so a new deployment counts as a change.
  const deployment = currentDeployment();
  const claim = await db.rpc("claim_public_page_changes", { p_deployment: deployment });
  if (claim.error) return failure("claim", claim.error.message);
  if (!claim.data) return NextResponse.json({ refreshed: false }, { headers: NO_STORE });

  const nonce = await readProbeNonce(deployment);
  const report = await db.rpc("complete_public_page_changes", { p_claim: claim.data, p_nonce: nonce, p_deployment: deployment });
  const counts = report.error ? null : readCounts(report.data);
  // Nothing left waiting needs no clear; after a failed report the changes still wait, so the pages are cleared anyway.
  const cleared = counts?.waiting === 0 || dropCachedListingPages();
  if (report.error) return failure("complete", report.error.message);
  if (!counts) return failure("complete", "unexpected report");
  if (!cleared) return failure("drop", "revalidatePath failed");
  console.info("public_pages_refreshed", JSON.stringify({ ...counts, checked: nonce !== null }));
  return NextResponse.json({ refreshed: true }, { headers: NO_STORE });
}

// The check page's nonce as this deployment's cache serves it now, or null. A stale copy is tried again, a second
// apart, since the cache rebuilds it in the background, and so is a copy from another deployment: the site's domain
// moves to a new deployment (a deploy, a rollback) while runs of the old one finish, and a clear here says nothing about
// another deployment's cache.
async function readProbeNonce(deployment: string | null) {
  let seen = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await sleep(1000);
    try {
      const response = await fetch(absoluteUrl(CACHE_PROBE_PATH), {
        headers: { "User-Agent": "Laria public pages refresh" },
        signal: AbortSignal.timeout(5000),
      });
      seen = (response.headers.get("x-vercel-cache") ?? response.headers.get("x-nextjs-cache") ?? "none").toUpperCase();
      const body: unknown = response.ok ? await response.json() : null;
      const nonce = body && typeof body === "object" && "nonce" in body ? body.nonce : null;
      const built = body && typeof body === "object" && "deployment" in body ? body.deployment : undefined;
      if (built !== deployment) seen = `${seen} other deployment`;
      else if (CURRENT_COPY.has(seen) && typeof nonce === "string" && NONCE.test(nonce)) return nonce;
      if (!response.ok) seen = `${seen} ${response.status}`;
    } catch (error) {
      seen = error instanceof Error ? error.name : "error";
    }
  }
  console.warn("public_pages_probe_unavailable", JSON.stringify({ seen: seen.slice(0, 60) }));
  return null;
}

function readCounts(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { done, waiting } = value as Record<string, unknown>;
  return typeof done === "number" && typeof waiting === "number" ? { done, waiting } : null;
}

function failure(step: string, message: string) {
  console.error("public_pages_refresh_failure", JSON.stringify({ step, message: message.slice(0, 200) }));
  return NextResponse.json({ message: "No se pudieron actualizar las páginas." }, { status: 503, headers: NO_STORE });
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Compared as bytes: a header of the same length in characters can still differ in bytes.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
