import { NextResponse } from "next/server";
import { sameOriginEventRequest } from "@/lib/marketplace-events-server";
import { photoDHash } from "@/lib/photo-fingerprint";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9]{1,2}\.(jpg|png|webp)$/;

// safe-02 (accounts batch): saves a stolen-gear report. The browser has already uploaded the photos under the person's
// own folder of the private bucket; the server reads each one back, computes its fingerprint (lib/photo-fingerprint.ts)
// and hands everything to submit_stolen_gear_report, which looks for matches at once. "Reportar" never touches a
// listing, and the reporter hears back only after Admin reviews a match.
export async function POST(request: Request) {
  if (!sameOriginEventRequest(request)) return failure("Solicitud no permitida.", 403);
  const supabase = await getSupabaseServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return failure("Tu sesión terminó. Vuelve a ingresar.", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (key: string, max: number) => (typeof body?.[key] === "string" ? (body[key] as string).trim().slice(0, max) : "");
  const paths = Array.isArray(body?.photos) ? (body.photos as unknown[]).filter((path): path is string => typeof path === "string") : [];
  if (paths.length > 6 || paths.some((path) => !PATH.test(path) || !path.startsWith(`${auth.user.id}/`))) return failure("Revisa las fotos.", 400);
  const stolenOn = text("stolen_on", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stolenOn)) return failure("Indica la fecha del robo.", 400);

  const photos: { path: string; dhash?: string }[] = [];
  for (const path of paths) {
    const { data } = await supabase.storage.from("stolen-gear-photos").download(path);
    const dhash = data ? await photoDHash(await data.arrayBuffer()) : null;
    photos.push(dhash ? { path, dhash } : { path });
  }
  const { data, error } = await supabase.rpc("submit_stolen_gear_report", {
    p_brand: text("brand", 80),
    p_model: text("model", 120) || null,
    p_description: text("description", 1000),
    p_serial: text("serial", 60) || null,
    p_stolen_on: stolenOn,
    p_place: text("place", 120),
    p_police_report: text("police_report", 60),
    p_police_station: text("police_station", 120) || null,
    p_photos: photos,
  });
  const message = error?.message ?? "";
  if (message.includes("STOLEN_SERIAL_OR_PHOTO_REQUIRED")) return failure("Agrega el número de serie o al menos una foto tuya del equipo.", 400);
  if (message.includes("STOLEN_SERIAL_INVALID")) return failure("El número de serie debe tener entre 4 y 40 letras o números.", 400);
  if (message.includes("STOLEN_RATE_LIMITED")) return failure("Ya enviaste varios reportes hoy. Si necesitas reportar otro equipo, escríbenos desde el Centro de ayuda.", 429);
  if (message.includes("STOLEN_REPORT_INVALID") || message.includes("STOLEN_PHOTOS_INVALID")) return failure("Revisa los datos del reporte.", 400);
  const code = typeof data === "object" && data !== null && !Array.isArray(data) && typeof data.code === "string" ? data.code : null;
  if (error || !code) return failure("No pudimos guardar el reporte. Vuelve a intentarlo.", 503);
  return NextResponse.json({ code }, { headers: NO_STORE });
}

function failure(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: NO_STORE });
}
