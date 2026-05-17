import { NextResponse } from "next/server";
import {
  INDIVIDUAL_SELLER_ACCOUNT_TYPE,
  STORE_OWNER_ACCOUNT_TYPE,
} from "@/lib/auth/profile";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

type InviteAccountType = "seller" | "store_owner";

const inviteRoutes: Record<InviteAccountType, string> = {
  seller: "/registro/vendedor/invitacion",
  store_owner: "/registro/tienda/invitacion",
};

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();

  if (!supabase) {
    return jsonError("Supabase no esta configurado.", 500);
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

  if (adminError || isAdmin !== true) {
    return jsonError("No tienes permisos para enviar invitaciones.", 403);
  }

  const payload = await request.json().catch(() => null);
  const email = readText(payload, "email").toLowerCase();
  const fullName = readText(payload, "fullName");
  const phone = readText(payload, "phone");
  const accountType = readAccountType(payload);
  const city = readText(payload, "city");
  const regionInput = readText(payload, "region");
  const normalizedRegion = regionInput ? normalizePeruRegion(regionInput) : null;
  const region = normalizedRegion ?? "";
  const storeName = readText(payload, "storeName");
  const notes = readText(payload, "notes");

  if (!isValidEmail(email)) {
    return jsonError("Ingresa un correo valido.", 400);
  }

  if (!fullName) {
    return jsonError("Ingresa el nombre completo.", 400);
  }

  if (phone.replace(/\D/g, "").length < 9) {
    return jsonError("Ingresa un WhatsApp valido.", 400);
  }

  if (!accountType) {
    return jsonError("Selecciona el tipo de cuenta.", 400);
  }

  if (regionInput && !normalizedRegion) {
    return jsonError("Selecciona una region valida de Peru.", 400);
  }

  const adminClient = getSupabaseAdminClient();

  if (!adminClient) {
    return jsonError("Falta configurar SUPABASE_SERVICE_ROLE_KEY.", 500);
  }

  const siteUrl = getSiteUrl(request);
  const finalInvitePath = inviteRoutes[accountType];
  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(
    finalInvitePath,
  )}`;
  const metadata = {
    account_type:
      accountType === "seller"
        ? INDIVIDUAL_SELLER_ACCOUNT_TYPE
        : STORE_OWNER_ACCOUNT_TYPE,
    invite_account_type: accountType === "seller" ? "individual" : "store",
    full_name: fullName,
    phone,
    city,
    region,
    store_name: accountType === "store_owner" ? storeName : "",
    fieldwork_notes: notes,
  };

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: metadata,
  });

  if (error) {
    return jsonError(
      "No se pudo enviar la invitacion. Revisa si el usuario ya existe o si Supabase Auth esta configurado.",
      400,
    );
  }

  console.info("[admin-invite] Invitacion enviada", {
    email,
    accountType,
    finalInvitePath,
    storeName: accountType === "store_owner" ? storeName : undefined,
  });

  return NextResponse.json({
    ok: true,
    message: "Invitacion enviada correctamente.",
    invite: {
      email,
      userId: data.user?.id ?? null,
      accountType,
      finalInvitePath,
      redirectTo,
      fullName,
      phone,
      city,
      region,
      storeName,
      notes,
    },
  });
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

function readText(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return "";
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function readAccountType(payload: unknown): InviteAccountType | null {
  const value = readText(payload, "accountType");

  if (value === "seller" || value === "store_owner") {
    return value;
  }

  return null;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSiteUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");

  if (configuredUrl) {
    return configuredUrl;
  }

  return new URL(request.url).origin;
}
