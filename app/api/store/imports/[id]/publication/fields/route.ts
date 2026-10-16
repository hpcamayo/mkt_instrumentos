import { parsePublishFieldsRequest, readPublishRowFields, savePublishRowFields } from "@/lib/store-import/publication-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { importErrorResponse, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// "Completar datos" on the import result (review fix B5). GET ?row=N: the row's publication values as they stand.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, false);
  if ("response" in auth) return auth.response;
  const row = Number(new URL(request.url).searchParams.get("row"));
  if (!Number.isSafeInteger(row) || row < 1) return importJson({ code: "IMPORT_ROW_NOT_FOUND", message: "Esa fila no está en esta importación." }, 400);
  try {
    return importJson(await readPublishRowFields(auth.db, id, row));
  } catch (error) {
    return importErrorResponse(error);
  }
}

// POST { row, fields?: { brand, model, category, instrument_type, condition, description }, price?, itemVersion? }.
// An empty string clears a field. The price needs the SKU's version, as every inventory edit does.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, true);
  if ("response" in auth) return auth.response;
  const input = parsePublishFieldsRequest(await request.json().catch(() => null));
  if (!input) return importJson({ code: "IMPORT_FIELDS_INVALID", message: "Revisa los datos ingresados." }, 400);
  try {
    return importJson(await savePublishRowFields(auth.db, id, input));
  } catch (error) {
    return importErrorResponse(error);
  }
}
