import { parsePublishRequest, publishImportRows, readPublishView } from "@/lib/store-import/publication-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { importErrorResponse, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The publication step (design §7.7): every applied row with what it still needs to be published, and the allowance.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, false);
  if ("response" in auth) return auth.response;
  try {
    return importJson(await readPublishView(auth.db, id));
  } catch (error) {
    return importErrorResponse(error);
  }
}

// "Publicar seleccionados": { rows: number[] (≤ 20), rulesAccepted: true }. The page sends larger selections in
// chunks of 20.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, true);
  if ("response" in auth) return auth.response;
  const input = parsePublishRequest(await request.json().catch(() => null));
  if (!input) return importJson({ code: "IMPORT_PUBLISH_REQUEST_INVALID", message: "Solicitud de publicación inválida." }, 400);
  try {
    return importJson(await publishImportRows(auth.db, auth.userId, id, input.rows, input.rulesAccepted));
  } catch (error) {
    return importErrorResponse(error);
  }
}
