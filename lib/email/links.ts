import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// save-07: one-click links in e-mails ("Pausar esta alerta", "No más bajas de precio", "No más resumen semanal")
// and the List-Unsubscribe header. A link carries who it is for and what it does, signed with HMAC-SHA256, so it
// works without signing in and cannot be changed to act on someone else. Links last 180 days.
export type EmailLinkAction = "pause_alert" | "no_price_drops" | "no_follow_digest";
export type EmailLinkPayload = { user: string; action: EmailLinkAction; alert?: string; expires: number };

const ACTIONS: readonly EmailLinkAction[] = ["pause_alert", "no_price_drops", "no_follow_digest"];
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// EMAIL_LINK_SECRET when set; otherwise a key derived from the service role key, so a new deployment needs no new
// setting. Rotating either one invalidates links already sent, which only means a person signs in to change it.
function secret() {
  const own = process.env.EMAIL_LINK_SECRET;
  if (own && own.length >= 32) return own;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return null;
  return createHash("sha256").update(`laria-email-links:${service}`).digest("hex");
}

function sign(body: string, key: string) {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function createEmailLinkToken(payload: Omit<EmailLinkPayload, "expires">, now = Date.now()) {
  const key = secret();
  if (!key || !UUID.test(payload.user) || !ACTIONS.includes(payload.action) || (payload.action === "pause_alert" && !UUID.test(payload.alert ?? ""))) return null;
  const body = Buffer.from(JSON.stringify({ u: payload.user, a: payload.action, l: payload.alert, e: now + LIFETIME_MS })).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function readEmailLinkToken(token: string | null | undefined, now = Date.now()): EmailLinkPayload | null {
  const key = secret();
  if (!key || !token || token.length > 600) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: unknown; a?: unknown; l?: unknown; e?: unknown };
    if (typeof data.u !== "string" || !UUID.test(data.u) || !ACTIONS.includes(data.a as EmailLinkAction) || typeof data.e !== "number" || data.e < now) return null;
    if (data.a === "pause_alert" && (typeof data.l !== "string" || !UUID.test(data.l))) return null;
    return { user: data.u, action: data.a as EmailLinkAction, alert: typeof data.l === "string" ? data.l : undefined, expires: data.e };
  } catch {
    return null;
  }
}

export const EMAIL_LINK_LABELS: Record<EmailLinkAction, { link: string; done: string; question: string }> = {
  pause_alert: { link: "Pausar esta alerta", question: "¿Pausar esta alerta?", done: "Pausamos la alerta. Puedes reactivarla cuando quieras en Mi cuenta › Alertas." },
  no_price_drops: { link: "No más bajas de precio", question: "¿Dejar de recibir correos de bajas de precio?", done: "Listo, no te enviaremos más correos de bajas de precio. Seguirás viéndolas en Notificaciones." },
  no_follow_digest: { link: "No más resumen semanal", question: "¿Dejar de recibir el resumen semanal de lo que sigues?", done: "Listo, no te enviaremos más el resumen semanal. Lo nuevo de lo que sigues seguirá en Para ti." },
};
