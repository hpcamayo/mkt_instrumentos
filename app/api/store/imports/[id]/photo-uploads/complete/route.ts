import { completePhotoUploads } from "@/lib/store-import/photos-server";
import { photoOwner } from "@/lib/store-import/photo-routes";
import { importErrorResponse, importJson } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// After the browser uploaded a batch: the server reads each photo, checks it and matches the import again (design
// §8.1 step 3, §8.2). Body: { assetIds: string[] } (≤ 25).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await photoOwner(request, id, true);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as { assetIds?: unknown } | null;
  const assetIds = Array.isArray(body?.assetIds) ? body.assetIds.filter((value): value is string => typeof value === "string") : [];
  if (!assetIds.length || assetIds.length > 25) {
    return importJson({ code: "IMPORT_PHOTO_REQUEST_INVALID", message: "Solicitud de fotos inválida." }, 400);
  }
  try {
    return importJson(await completePhotoUploads(auth.db, auth.userId, id, assetIds));
  } catch (error) {
    return importErrorResponse(error);
  }
}
