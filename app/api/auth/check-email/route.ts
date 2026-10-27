import { NextResponse } from "next/server";
import { TOO_MANY_ATTEMPTS } from "@/lib/auth/limits";
import { RATE_LIMITS, allowRequest } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

// The sign-up form asks whether an address already has an account. Launch audit A28: each visitor can ask a limited
// number of times, so the route can't be used to sweep a list of addresses.
export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = normalizeEmail(readText(payload, "email"));

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, available: false, message: "Ingresa un correo válido." },
      { status: 400 },
    );
  }
  if (!(await allowRequest(RATE_LIMITS.checkEmail, request))) {
    return NextResponse.json({ ok: false, available: false, message: TOO_MANY_ATTEMPTS }, { status: 429 });
  }

  const adminClient = getSupabaseAdminClient();

  if (!adminClient) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        message: "No se pudo verificar el correo en este momento.",
      },
      { status: 500 },
    );
  }

  const { data: exists, error } = await adminClient.rpc("auth_email_exists", {
    p_email: email,
  });

  if (error || exists === null) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        message: "No se pudo verificar el correo en este momento.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    available: !exists,
  });
}

function readText(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return "";
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
