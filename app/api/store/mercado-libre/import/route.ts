import { ML_IMPORT_MAX_ITEMS, ML_ITEM_ID } from "@/lib/mercadolibre/mapping";
import { ownerConnection, prepareImport } from "@/lib/mercadolibre/server";
import { mlFailure, mlJson, mlOwner } from "@/lib/mercadolibre/routes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// reach-01: turns the chosen publications into an import (body: { itemIds }) and returns the session the wizard opens.
export async function POST(request: Request) {
  const auth = await mlOwner(request, true);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { itemIds?: unknown } | null;
  const ids = Array.isArray(body?.itemIds) ? body.itemIds.filter((id): id is string => typeof id === "string" && ML_ITEM_ID.test(id)) : [];
  if (!ids.length || ids.length > ML_IMPORT_MAX_ITEMS || Object.keys(body ?? {}).some((key) => key !== "itemIds")) {
    return mlJson({ ok: false, message: `Elige entre 1 y ${ML_IMPORT_MAX_ITEMS} publicaciones.` }, 400);
  }
  try {
    const connection = await ownerConnection(auth.config, auth.userId);
    if (!connection) return mlJson({ ok: false, code: "MERCADOLIBRE_NOT_CONNECTED", message: "Conecta tu cuenta de Mercado Libre." }, 409);
    return mlJson({ ok: true, ...(await prepareImport(auth.db, connection, ids)) }, 201);
  } catch (error) {
    return mlFailure(error);
  }
}
