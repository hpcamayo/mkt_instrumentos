import { runImportStep } from "@/lib/store-import/server";
import { importClient, importErrorResponse, importJson, isImportSessionId } from "@/lib/store-import/route-helpers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One bounded, checkpointed unit of import work (design §7.1). The open wizard calls it until `next` is no longer
// "continue"; closing the page simply stops the loop at the last checkpoint.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isImportSessionId(id)) return importJson({ code: "IMPORT_SESSION_NOT_FOUND", message: "No encontramos esta importación." }, 404);
  const auth = await importClient(request, true);
  if ("response" in auth) return auth.response;
  try {
    return importJson(await runImportStep(auth.db, id));
  } catch (error) {
    return importErrorResponse(error);
  }
}
