import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// safe-08 (accounts batch): which browser an account signs in from. A random identifier lives in an httpOnly cookie on
// the browser; the database only ever sees its SHA-256 hash, plus a plain label such as "Chrome en Android". A sign-in
// from a browser the account has not used before sends one e-mail (record_sign_in_device).

export const DEVICE_COOKIE = "laria_dispositivo";
const DEVICE_MAX_AGE = 400 * 24 * 60 * 60;

export function deviceLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Navegador";
  const system = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac"
    : /CrOS/.test(ua) ? "Chromebook"
    : /Linux/.test(ua) ? "Linux"
    : null;
  return system ? `${browser} en ${system}` : browser;
}

export function hashDeviceId(id: string) {
  return createHash("sha256").update(`laria-device:${id}`).digest("hex");
}

function validDeviceId(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
}

// Reads the browser's identifier or gives it a new one (set on the response).
export function ensureDeviceId(request: NextRequest, response: NextResponse) {
  const existing = validDeviceId(request.cookies.get(DEVICE_COOKIE)?.value);
  if (existing) return existing;
  const created = randomBytes(24).toString("base64url");
  response.cookies.set(DEVICE_COOKIE, created, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: DEVICE_MAX_AGE,
  });
  return created;
}

// Called after Auth verifies the sign-in. Retiring an older non-Admin factor is required for pilot account settings;
// device tracking below remains best effort because its e-mail is a courtesy.
export async function recordSignInDevice(supabase: SupabaseClient<Database>, request: NextRequest, response: NextResponse, user?: User | null) {
  if (user?.app_metadata?.role !== "admin" && user?.factors?.length) {
    const { retirePilotNonAdminFactors } = await import("@/lib/auth/pilot-two-step");
    await retirePilotNonAdminFactors(user);
  }
  try {
    const id = ensureDeviceId(request, response);
    await supabase.rpc("record_sign_in_device", {
      p_device_hash: hashDeviceId(id),
      p_label: deviceLabel(request.headers.get("user-agent")),
    });
  } catch {
    // Logged by Supabase; signing in goes on.
  }
}
