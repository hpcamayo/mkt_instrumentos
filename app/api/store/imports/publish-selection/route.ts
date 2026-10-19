import { inventoryError } from "@/lib/store-inventory";
import { importClient, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// stock-10 (Effortless Laria, stores): "Publicar seleccionados" from Inventario. Stages the chosen SKU as an applied
// import (create_inventory_publish_selection) and returns its id; the import's publication step takes it from there.
export async function POST(request: Request) {
  const auth = await importClient(request, true);
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.itemIds) ? [...new Set(body.itemIds as unknown[])] : [];
  if (!ids.length || ids.length > 200 || !ids.every((id) => typeof id === "string" && UUID.test(id))) {
    return importJson({ code: "INVENTORY_BULK_INVALID", message: "Elige entre 1 y 200 SKU." }, 400);
  }
  const { data, error } = await auth.db.rpc("create_inventory_publish_selection", { p_item_ids: ids });
  if (error || !data) {
    const parsed = inventoryError(error?.message);
    return importJson({ code: parsed.code, message: parsed.message }, parsed.code === "UNKNOWN" ? 500 : 409);
  }
  return importJson({ id: (data as { id: string }).id }, 201);
}
