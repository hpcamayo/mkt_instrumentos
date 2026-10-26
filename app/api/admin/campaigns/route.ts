import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CAMPAIGN_SLUG, parseCampaign } from "@/lib/campaigns";
import { CAMPAIGNS_CACHE_TAG } from "@/lib/campaigns-server";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { storeReachDb, storeReachErrorMessage } from "@/lib/store-reach-db";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// reach-05 "Campañas Laria": Admin creates or edits a campaign, publishes, unpublishes or cancels it, and removes an
// entry. The database checks the Admin role and the revision Admin saw, and audits every change; removals and
// cancellations need a reason the store reads.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Solicitud inválida.");
  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503);
  const db = storeReachDb(supabase);
  const revision = body.expectedRevision;
  const validRevision = Number.isSafeInteger(revision) && revision >= 1;

  if (body.action === "save") {
    const allowed = ["action", "id", "slug", "name", "description", "startsAt", "endsAt", "minDiscountPct", "expectedRevision"];
    if (Object.keys(body).some((key) => !allowed.includes(key))
      || (body.id !== undefined && body.id !== null && (!isEntityId(body.id) || !validRevision))
      || typeof body.slug !== "string" || !CAMPAIGN_SLUG.test(body.slug) || typeof body.name !== "string"
      || (body.description !== undefined && typeof body.description !== "string")
      || !isoTime(body.startsAt) || !isoTime(body.endsAt)
      || !Number.isSafeInteger(body.minDiscountPct)) return failure("Revisa los datos de la campaña.");
    const { data, error } = await db.rpc("admin_save_campaign", {
      p_id: body.id ?? null,
      p_slug: body.slug.slice(0, 60),
      p_name: body.name.slice(0, 80),
      p_description: typeof body.description === "string" ? body.description.slice(0, 600) : "",
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_min_discount_pct: body.minDiscountPct,
      p_expected_revision: body.id ? revision : null,
    });
    return result(data, error, "No se pudo guardar la campaña.");
  }

  if (body.action === "status") {
    if (Object.keys(body).some((key) => !["action", "id", "status", "expectedRevision", "reason"].includes(key))
      || !isEntityId(body.id) || !["published", "draft", "cancelled"].includes(body.status) || !validRevision
      || (body.reason !== undefined && typeof body.reason !== "string")) return failure("Solicitud inválida.");
    const { data, error } = await db.rpc("admin_set_campaign_status", {
      p_id: body.id,
      p_status: body.status,
      p_expected_revision: revision,
      p_reason: typeof body.reason === "string" ? body.reason.slice(0, 400) : null,
    });
    return result(data, error, "No se pudo cambiar el estado.");
  }

  if (body.action === "remove") {
    if (Object.keys(body).some((key) => !["action", "entryId", "reason"].includes(key)) || !isEntityId(body.entryId)
      || typeof body.reason !== "string") return failure("Solicitud inválida.");
    const { data, error } = await db.rpc("admin_remove_campaign_entry", { p_entry_id: body.entryId, p_reason: body.reason.slice(0, 400) });
    return result(data, error, "No se pudo retirar la publicación.");
  }

  return failure("Solicitud inválida.");
}

function isoTime(value: unknown) {
  return typeof value === "string" && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function result(data: unknown, error: { message?: string; code?: string } | null, fallback: string) {
  if (error) return failure(storeReachErrorMessage(error, `${fallback} Intenta nuevamente.`), error.code === "42501" ? 403 : 400);
  revalidateTag(CAMPAIGNS_CACHE_TAG);
  return NextResponse.json({ ok: true, campaign: parseCampaign(data) }, { headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}
