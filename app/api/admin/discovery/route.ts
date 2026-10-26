import { discoveryErrorMessage, discoveryFailure, discoverySuccess, isPlainObject } from "@/lib/discovery/api";
import { isEntityId } from "@/lib/marketplace-event-payload";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

type Rpc = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> };

const text = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : null);
const date = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

// The discovery Admin sections (docs/feature-ideas/discovery.md): collections, maker profiles and verified artists.
// Every function checks the Admin role and writes the audit; this route only shapes the request.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return discoveryFailure("Solicitud inválida.", 403);
  const body = await request.json().catch(() => null);
  if (!isPlainObject(body) || typeof body.action !== "string") return discoveryFailure("Solicitud inválida.");

  const supabase = await getSupabaseServerClient();
  if (!supabase) return discoveryFailure("No se pudo validar tu cuenta.", 503);
  const db = supabase as unknown as Rpc;

  let call: [string, Record<string, unknown>] | null = null;
  switch (body.action) {
    case "save_collection":
      if (body.id !== null && !isEntityId(body.id)) break;
      call = ["admin_save_collection", {
        p_id: body.id, p_slug: text(body.slug, 60), p_title: text(body.title, 80), p_intro: text(body.intro, 400),
        p_sets: Array.isArray(body.sets) ? body.sets.slice(0, 4) : null, p_starts_on: date(body.startsOn), p_ends_on: date(body.endsOn),
        p_published: body.published === true, p_sort_order: Number.isInteger(body.sortOrder) ? body.sortOrder : 100,
      }];
      break;
    case "delete_collection":
      if (isEntityId(body.id)) call = ["admin_delete_collection", { p_id: body.id }];
      break;
    case "maker_hidden":
      if (isEntityId(body.storeId) && typeof body.hidden === "boolean") call = ["admin_set_maker_hidden", { p_store_id: body.storeId, p_hidden: body.hidden, p_reason: text(body.reason, 500) }];
      break;
    case "save_artist":
      call = ["admin_save_artist_profile", {
        p_email: text(body.email, 320), p_slug: text(body.slug, 60), p_display_name: text(body.displayName, 80),
        p_story: text(body.story, 1200), p_link_url: text(body.linkUrl, 300), p_check: text(body.check, 500),
      }];
      break;
    case "revoke_artist":
      if (isEntityId(body.userId)) call = ["admin_revoke_artist_profile", { p_user_id: body.userId, p_reason: text(body.reason, 500) }];
      break;
  }
  if (!call) return discoveryFailure("Solicitud inválida.");

  const { data, error } = await db.rpc(...call);
  if (error) {
    if (!discoveryErrorMessage(error, "")) console.error("admin_discovery_failure", call[0], error.code ?? "rpc_error");
    return discoveryFailure(discoveryErrorMessage(error, "No se pudo guardar. Intenta nuevamente."), error.code === "42501" ? 403 : 400);
  }
  return discoverySuccess(data);
}
