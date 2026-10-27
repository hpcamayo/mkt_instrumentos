import { listItems, ownerConnection } from "@/lib/mercadolibre/server";
import { mlFailure, mlJson, mlOwner } from "@/lib/mercadolibre/routes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// reach-01: one page (50) of the account's active Mercado Libre publications, for the owner to choose from.
export async function GET(request: Request) {
  const auth = await mlOwner(request, false);
  if ("response" in auth) return auth.response;
  const offset = Number(new URL(request.url).searchParams.get("desde") ?? "0");
  try {
    const connection = await ownerConnection(auth.config, auth.userId);
    if (!connection) return mlJson({ ok: false, code: "MERCADOLIBRE_NOT_CONNECTED", message: "Conecta tu cuenta de Mercado Libre." }, 409);
    return mlJson({ ok: true, ...(await listItems(connection, Number.isSafeInteger(offset) ? offset : 0)) });
  } catch (error) {
    return mlFailure(error);
  }
}
