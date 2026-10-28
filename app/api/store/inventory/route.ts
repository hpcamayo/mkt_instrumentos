import { NextResponse } from "next/server";
import { inventoryCall, type InventoryActionBody } from "@/lib/inventory-actions";
import { CONFLICT_CODES, inventoryError } from "@/lib/store-inventory";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// Owner inventory actions (docs/store-operations/design.md §4.2, §13). The route only shapes arguments: every rule
// (ownership, the pilot gate, versions, idempotency, stock limits) is enforced by the database functions, called with
// the owner's own session so auth.uid() binds the store.

// The functions put a JSON object in the error detail (current version, available units, the failing SKU).
function parseDetail(detail: string | null | undefined) {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as InventoryActionBody | null;
  const call = body && typeof body === "object" && !Array.isArray(body) ? inventoryCall(body) : null;
  if (!call) return NextResponse.json({ code: "INVALID", message: "Solicitud inválida." }, { status: 400 });

  const supabase = await getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ code: "UNAVAILABLE", message: "No se pudo validar tu cuenta." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ code: "AUTH_REQUIRED", message: "Ingresa a tu cuenta." }, { status: 401 });

  const { data, error } = await supabase.rpc(call.fn, call.args);
  if (error) {
    const failure = inventoryError(error.message);
    if (failure.code === "UNKNOWN") console.error("inventory action failed", call.fn, error.code, error.message);
    const status = CONFLICT_CODES.has(failure.code) ? 409 : failure.code === "INVENTORY_ITEM_NOT_OWNED" ? 404 : 400;
    return NextResponse.json({ ...failure, detail: failure.code === "UNKNOWN" ? null : parseDetail(error.details) }, { status });
  }
  return NextResponse.json({ ok: true, data });
}
