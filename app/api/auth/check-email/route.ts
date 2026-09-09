import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = normalizeEmail(readText(payload, "email"));

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, available: false, message: "Ingresa un correo valido." },
      { status: 400 },
    );
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
