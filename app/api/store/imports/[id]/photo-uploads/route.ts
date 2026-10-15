import { parsePhotoFiles, requestPhotoUploads } from "@/lib/store-import/photos-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { importErrorResponse, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";

// Upload slots for up to 25 photos (design §8.1 step 2). The browser then puts each photo at its slot's path with the
// owner's own session; the storage policy accepts exactly that path, once.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, true);
  if ("response" in auth) return auth.response;
  const files = parsePhotoFiles(await request.json().catch(() => null));
  if (!files) return importJson({ code: "IMPORT_PHOTO_REQUEST_INVALID", message: "Envía entre 1 y 25 fotos por vez." }, 400);
  try {
    return importJson(await requestPhotoUploads(auth.db, id, files));
  } catch (error) {
    return importErrorResponse(error);
  }
}
