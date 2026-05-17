import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

const maxPagesToScan = 25;
const usersPerPage = 1000;

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

  const exists = await authEmailExists(email, adminClient);

  if (exists === null) {
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

async function authEmailExists(
  email: string,
  adminClient: ReturnType<typeof getSupabaseAdminClient>,
) {
  if (!adminClient) {
    return null;
  }

  let page = 1;
  let lastPage = 1;

  do {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: usersPerPage,
    });

    if (error) {
      return null;
    }

    if (
      data.users.some((user) => normalizeEmail(user.email ?? "") === email)
    ) {
      return true;
    }

    lastPage = data.lastPage || page;
    page += 1;
  } while (page <= lastPage && page <= maxPagesToScan);

  return false;
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
