import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { fingerprintListing, parsePhotoRefs } from "@/lib/photo-fingerprint";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const maxDuration = 30;

// Feature ideas, accounts batch (safe-05, safe-02): what the moderation queue shows next to a listing. If the listing's
// current photos were not hashed yet, they are hashed now; then come its open copy flags and the stolen-gear reports
// it matches that Admin has not reviewed yet. Reading this never changes the listing.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !isEntityId(body.listingId)) return failure("Solicitud inválida.");
  const supabase = await getSupabaseServerClient();
  const admin = getSupabaseAdminClient();
  if (!supabase || !admin) return failure("No se pudo validar tu cuenta.", 503);
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return failure("Solo Admin.", 403);

  const { data: state } = await admin.rpc("service_listings_fingerprint_state", { p_listing_ids: [body.listingId] });
  const current = Array.isArray(state) ? (state[0] as { current?: boolean; photos?: unknown } | undefined) : undefined;
  if (current && !current.current) await fingerprintListing(admin, body.listingId, parsePhotoRefs(current.photos));

  const [{ data: flags, error }, { data: matches }] = await Promise.all([
    supabase.rpc("admin_listing_red_flags", { p_listing_ids: [body.listingId] }),
    // The match table is not in the generated types (it has no browser access at all).
    (admin as unknown as SupabaseClient).from("stolen_report_matches").select("id,source,detail,stolen_gear_reports(code)").eq("listing_id", body.listingId).eq("status", "pending"),
  ]);
  if (error) return failure("No se pudieron cargar las alertas.", 400);
  return NextResponse.json({
    ok: true,
    flags: Array.isArray(flags) ? flags : [],
    matches: ((matches ?? []) as { id: string; source: string; detail: unknown; stolen_gear_reports: { code: string } | { code: string }[] | null }[]).map((match) => {
      const report = Array.isArray(match.stolen_gear_reports) ? match.stolen_gear_reports[0] : match.stolen_gear_reports;
      return { id: match.id, source: match.source, detail: match.detail, code: report?.code ?? null };
    }),
  }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
