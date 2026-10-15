import { applyPhotoAction, parsePhotoAction, readPhotoView } from "@/lib/store-import/photos-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { importErrorResponse, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// The Fotos step: every photo of the import with where it went, and every row with its photo state.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, false);
  if ("response" in auth) return auth.response;
  try {
    const view = await readPhotoView(auth.db, id);
    if (!view) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
    return importJson(view);
  } catch (error) {
    return importErrorResponse(error);
  }
}

// Manual correction (design §8.2): { action: "place", assetId, row | null } moves a photo to another row or takes it
// out; { action: "order", row, assetIds } sets one row's order; { action: "reset" } matches everything again.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, true);
  if ("response" in auth) return auth.response;
  const action = parsePhotoAction(await request.json().catch(() => null));
  if (!action) return importJson({ code: "IMPORT_REQUEST_INVALID", message: "Solicitud inválida." }, 400);
  try {
    return importJson(await applyPhotoAction(auth.db, id, action));
  } catch (error) {
    return importErrorResponse(error);
  }
}
