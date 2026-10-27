import { NextResponse } from "next/server";
import { NUBEFACT_TOKEN, NUBEFACT_URL, canRetry, type ReceiptRecord } from "@/lib/einvoice/nubefact";
import { einvoiceAvailable, einvoiceKey, sealToken, tokenHint } from "@/lib/einvoice/secret";
import { sendReceipt, sendVoid, storeCredentials, testConnection } from "@/lib/einvoice/server";
import { receiptError } from "@/lib/einvoice/errors";
import { inventoryDb } from "@/lib/store-inventory";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

// Feature ideas, store-locations batch, run-03 "Boleta electrónica". The owner's session does everything the owner
// decides (connection, preparing a receipt and its number, asking to void); the service role only reads the store's
// sealed token and records what Nubefact answered. Off, and refusing, until LARIA_EINVOICE_KEY is set.

const KEY = /^[A-Za-z0-9:_-]{8,160}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(message: string, status = 400, code = "INVALID") {
  return NextResponse.json({ code, message }, { status });
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export async function POST(request: Request) {
  const body = object(await request.json().catch(() => null));
  if (!body || typeof body.action !== "string") return failure("Solicitud inválida.");
  if (body.action !== "disconnect" && !einvoiceAvailable()) return failure("La boleta electrónica aún no está disponible en Laria.", 503, "EINVOICE_OFF");

  const supabase = await getSupabaseServerClient();
  if (!supabase) return failure("No se pudo validar tu cuenta.", 503, "UNAVAILABLE");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return failure("Ingresa a tu cuenta.", 401, "AUTH_REQUIRED");
  const db = inventoryDb(supabase);
  const admin = getSupabaseAdminClient();

  async function rpc<T>(fn: string, args: Record<string, unknown>) {
    const { data, error } = await db.rpc(fn, args);
    if (error) {
      const known = receiptError(error.message);
      if (known.code === "UNKNOWN") console.error("receipt action failed", fn, error.code, error.message);
      return { error: NextResponse.json(known, { status: known.code === "UNKNOWN" ? 500 : 400 }) };
    }
    return { data: data as T };
  }

  async function ownStoreId() {
    const { data } = await db.from("stores").select("id").eq("owner_user_id", userData.user!.id).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  async function ownReceipt(id: unknown) {
    if (typeof id !== "string" || !UUID.test(id)) return null;
    const { data } = await db.from("store_receipts").select("*").eq("id", id).maybeSingle();
    return (data as (ReceiptRecord & { store_id: string }) | null) ?? null;
  }

  switch (body.action) {
    case "issue": {
      const fields = object(body.fields);
      if (!fields || typeof fields.sale_key !== "string" || !KEY.test(fields.sale_key)) return failure("Solicitud inválida.");
      if (!admin) return failure("No se pudo emitir el comprobante en este momento.", 503, "UNAVAILABLE");
      const prepared = await rpc<{ receipt: ReceiptRecord & { store_id: string } }>("prepare_store_receipt", { p_fields: fields });
      if (prepared.error) return prepared.error;
      const receipt = prepared.data.receipt;
      const sent = canRetry(receipt) ? await sendReceipt(admin, receipt.store_id, receipt) : receipt;
      return NextResponse.json({ ok: true, data: { receipt: sent } });
    }
    case "retry": {
      const receipt = await ownReceipt(body.receipt_id);
      if (!receipt) return failure("No encontramos ese comprobante.", 404, "RECEIPT_NOT_FOUND");
      if (!canRetry(receipt)) return NextResponse.json({ ok: true, data: { receipt } });
      if (!admin) return failure("No se pudo enviar el comprobante en este momento.", 503, "UNAVAILABLE");
      return NextResponse.json({ ok: true, data: { receipt: await sendReceipt(admin, receipt.store_id, receipt) } });
    }
    case "void": {
      const receipt = await ownReceipt(body.receipt_id);
      if (!receipt) return failure("No encontramos ese comprobante.", 404, "RECEIPT_NOT_FOUND");
      if (!admin) return failure("No se pudo anular el comprobante en este momento.", 503, "UNAVAILABLE");
      const asked = await rpc<{ receipt: ReceiptRecord }>("request_store_receipt_void", {
        p_receipt_id: receipt.id, p_reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : null,
      });
      if (asked.error) return asked.error;
      const result = await sendVoid(admin, receipt.store_id, asked.data.receipt);
      return NextResponse.json({ ok: true, data: result });
    }
    case "settings": {
      const fields = object(body.fields);
      if (!fields) return failure("Solicitud inválida.");
      const storeId = await ownStoreId();
      if (!storeId) return failure("Necesitas una tienda.", 404, "STORE_REQUIRED");
      const next: Record<string, unknown> = {};
      for (const name of ["boleta_series", "factura_series", "igv_affectation"] as const) {
        if (typeof fields[name] === "string") next[name] = (fields[name] as string).trim().slice(0, 20);
      }
      for (const name of ["next_boleta_number", "next_factura_number"] as const) {
        if (fields[name] !== undefined) next[name] = fields[name];
      }
      if (typeof fields.email_customer === "boolean") next.email_customer = fields.email_customer;
      const apiUrl = typeof fields.api_url === "string" ? fields.api_url.trim() : null;
      const token = typeof fields.token === "string" ? fields.token.trim() : null;
      if (token || apiUrl) {
        if (!apiUrl || !NUBEFACT_URL.test(apiUrl)) return failure("Pega la RUTA completa de Nubefact: empieza con https://api.nubefact.com/api/v1/.", 400, "EINVOICE_URL");
        let usable = token;
        if (!usable) {
          // A new route with the saved token.
          if (!admin) return failure("No se pudo guardar la conexión en este momento.", 503, "UNAVAILABLE");
          const saved = await storeCredentials(admin, storeId);
          if ("error" in saved) return failure("Pega también el TOKEN de Nubefact.", 400, "EINVOICE_TOKEN_REQUIRED");
          usable = saved.token;
        }
        if (!NUBEFACT_TOKEN.test(usable)) return failure("El TOKEN de Nubefact son letras y números, sin espacios.", 400, "EINVOICE_TOKEN");
        const check = await testConnection(apiUrl, usable);
        if (!check.ok) return failure(check.message, 400, "EINVOICE_CHECK_FAILED");
        next.api_url = apiUrl;
        next.token_ciphertext = sealToken(usable, storeId, einvoiceKey()!);
        next.token_hint = tokenHint(usable);
        next.checked = true;
      }
      const saved = await rpc<Record<string, unknown>>("save_einvoice_settings", { p_fields: next });
      if (saved.error) return saved.error;
      return NextResponse.json({ ok: true, data: saved.data });
    }
    case "test": {
      const storeId = await ownStoreId();
      if (!storeId || !admin) return failure("No se pudo comprobar la conexión.", 503, "UNAVAILABLE");
      const saved = await storeCredentials(admin, storeId);
      if ("error" in saved) return failure(saved.error, 400, "EINVOICE_NOT_CONNECTED");
      const check = await testConnection(saved.apiUrl, saved.token);
      if (!check.ok) return failure(check.message, 400, "EINVOICE_CHECK_FAILED");
      const updated = await rpc<Record<string, unknown>>("save_einvoice_settings", { p_fields: { checked: true } });
      if (updated.error) return updated.error;
      return NextResponse.json({ ok: true, data: updated.data });
    }
    case "disconnect": {
      const result = await rpc<Record<string, unknown>>("disconnect_einvoice", {});
      if (result.error) return result.error;
      return NextResponse.json({ ok: true, data: result.data });
    }
    default:
      return failure("Solicitud inválida.");
  }
}
