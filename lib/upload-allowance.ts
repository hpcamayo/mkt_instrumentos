import type { SupabaseClient } from "@supabase/supabase-js";

// Launch audit A18: an account may add only so many files to each upload bucket in 24 hours
// (laria_private.upload_daily_limit, supabase/migrations/20261114120000_launch_audit_privacy.sql). Storage refuses the
// next one as a policy violation, which tells the person nothing, so a form whose upload fails asks the database
// whether the limit is why, and then says when the next file fits.
export class UploadLimitReached extends Error {}

const DAY = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function uploadLimitMessage(bucket: string, limit: number, nextAt: string | null | undefined) {
  const sound = bucket === "listing-sound-clips";
  const when = nextAt && Number.isFinite(Date.parse(nextAt)) ? new Date(nextAt) : null;
  const time = when ? TIME.format(when) : "";
  return `Llegaste al límite de ${limit} ${sound ? "sonidos" : "fotos"} en 24 horas. ${
    when
      ? `Podrás subir ${sound ? "otro" : "otra"} desde el ${DAY.format(when)} a ${time.startsWith("01:") ? "la" : "las"} ${time}.`
      : "Vuelve a intentarlo mañana."
  }`;
}

// The limit as an error when the caller has used every place in the bucket; null when places are left or the database
// can't say (signed out, offline), so the form keeps its own message.
export async function uploadLimitReached(client: unknown, bucket: string) {
  try {
    const { data, error } = await (client as SupabaseClient).rpc("my_upload_allowance", { p_bucket: bucket });
    if (error || !data || typeof data !== "object") return null;
    const { limit, used, next_at: nextAt } = data as { limit?: unknown; used?: unknown; next_at?: unknown };
    if (typeof limit !== "number" || typeof used !== "number" || used < limit) return null;
    return new UploadLimitReached(uploadLimitMessage(bucket, limit, typeof nextAt === "string" ? nextAt : null));
  } catch {
    return null;
  }
}
