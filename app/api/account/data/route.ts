import { NextResponse } from "next/server";
import { accountClient, accountError, NO_STORE } from "@/lib/account/route-helpers";

// safe-09 (accounts batch): "Descargar mis datos", one JSON file with everything Laria holds about the account.
export async function GET(request: Request) {
  const client = await accountClient(request, { write: false, secondStep: true });
  if ("response" in client) return client.response;
  const { data, error } = await client.supabase.rpc("export_my_data");
  if (error || !data) return accountError("No pudimos preparar tus datos. Vuelve a intentarlo.", 503);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  return new NextResponse(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="laria-mis-datos-${day}.json"`,
    },
  });
}
