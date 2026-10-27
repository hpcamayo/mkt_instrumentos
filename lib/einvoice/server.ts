import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  issuePayload, lookupPayload, readProviderAnswer, voidPayload,
  type ProviderOutcome, type ReceiptRecord,
} from "@/lib/einvoice/nubefact";
import { einvoiceKey, openToken } from "@/lib/einvoice/secret";

// Feature ideas, store-locations batch, run-03: the server half of the Nubefact connection. The owner's session
// prepares a receipt (number, lines, customer); this file reads the store's token with the service role, sends the
// receipt to the store's own Nubefact account and records the answer with the service role, so only the provider's
// answer can mark a receipt issued. Tests pass their own `fetch`; nothing here runs in tests against the real service.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;
type Fetch = typeof fetch;

const TIMEOUT_MS = 20_000;

export async function callNubefact(apiUrl: string, token: string, payload: unknown, fetchImpl: Fetch = fetch): Promise<ProviderOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: { Authorization: `Token token="${token}"`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return readProviderAnswer(response.status, body);
  } catch {
    return { kind: "unreachable", message: "No pudimos conectar con Nubefact." };
  } finally {
    clearTimeout(timer);
  }
}

type Credentials = { apiUrl: string; token: string; emailCustomer: boolean };

export async function storeCredentials(admin: AnyClient, storeId: string): Promise<Credentials | { error: string }> {
  const key = einvoiceKey();
  if (!key) return { error: "La boleta electrónica aún no está disponible en Laria." };
  const { data, error } = await admin
    .from("store_einvoice_settings")
    .select("api_url, token_ciphertext, email_customer")
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) return { error: "No pudimos leer la conexión con Nubefact." };
  if (!data) return { error: "Conecta tu cuenta de Nubefact en Comprobantes." };
  const row = data as { api_url: string; token_ciphertext: string; email_customer: boolean };
  const token = openToken(row.token_ciphertext, storeId, key);
  if (!token) return { error: "Vuelve a pegar el token de Nubefact en Comprobantes → Conexión." };
  return { apiUrl: row.api_url, token, emailCustomer: row.email_customer };
}

async function record(admin: AnyClient, receiptId: string, result: Record<string, unknown>): Promise<ReceiptRecord | null> {
  const { data, error } = await admin.rpc("record_store_receipt_result", { p_receipt_id: receiptId, p_result: result });
  if (error) {
    console.error("receipt result not recorded", receiptId, error.code, error.message);
    return null;
  }
  return ((data as { receipt?: ReceiptRecord } | null)?.receipt ?? null);
}

function issuedResult(outcome: Extract<ProviderOutcome, { kind: "issued" }>) {
  return {
    status: "accepted",
    provider_link: outcome.link,
    pdf_url: outcome.pdf,
    xml_url: outcome.xml,
    cdr_url: outcome.cdr,
    sunat_accepted: outcome.sunatAccepted,
    sunat_description: outcome.sunatDescription,
  };
}

// Sends a prepared receipt. A receipt the provider already has (a retry after a lost answer) is read back instead of
// being sent twice; a connection failure is checked once with a lookup before it is reported.
export async function sendReceipt(admin: AnyClient, storeId: string, receipt: ReceiptRecord, fetchImpl: Fetch = fetch) {
  const credentials = await storeCredentials(admin, storeId);
  if ("error" in credentials) {
    return (await record(admin, receipt.id, { status: "error", error_message: credentials.error })) ?? receipt;
  }
  let outcome = await callNubefact(credentials.apiUrl, credentials.token, issuePayload(receipt, credentials), fetchImpl);
  if (outcome.kind === "exists" || outcome.kind === "unreachable") {
    const looked = await callNubefact(credentials.apiUrl, credentials.token, lookupPayload(receipt), fetchImpl);
    if (looked.kind === "issued") outcome = looked;
    else if (outcome.kind === "exists") outcome = { kind: "refused", code: null, message: "Nubefact ya tiene ese número con otros datos. Revisa la serie en tu cuenta." };
  }
  const result =
    outcome.kind === "issued" ? issuedResult(outcome)
      : outcome.kind === "credentials" ? { status: "error", error_message: `${outcome.message} Revisa la conexión en Comprobantes.` }
        : outcome.kind === "unreachable" ? { status: "error", error_message: `${outcome.message} Vuelve a intentarlo en unos minutos.` }
          : outcome.kind === "refused" ? { status: "error", error_message: outcome.message }
            : { status: "error", error_message: "Nubefact no encontró el comprobante. Vuelve a intentarlo." };
  return (await record(admin, receipt.id, result)) ?? receipt;
}

export async function sendVoid(admin: AnyClient, storeId: string, receipt: ReceiptRecord, fetchImpl: Fetch = fetch) {
  const credentials = await storeCredentials(admin, storeId);
  if ("error" in credentials) return { receipt: (await record(admin, receipt.id, { status: "void_failed", error_message: credentials.error })) ?? receipt, message: credentials.error };
  const outcome = await callNubefact(credentials.apiUrl, credentials.token, voidPayload(receipt, receipt.void_reason ?? "Anulación"), fetchImpl);
  if (outcome.kind === "issued") {
    return { receipt: (await record(admin, receipt.id, { status: "voided", sunat_description: outcome.sunatDescription })) ?? receipt, message: null };
  }
  const message = "message" in outcome ? outcome.message : "Nubefact no pudo anular el comprobante.";
  return { receipt: (await record(admin, receipt.id, { status: "void_failed", error_message: message })) ?? receipt, message };
}

// "Probar conexión": looks up a number nobody uses. "Not found" or a document both prove the route and token work.
export async function testConnection(apiUrl: string, token: string, fetchImpl: Fetch = fetch): Promise<{ ok: true } | { ok: false; message: string }> {
  const outcome = await callNubefact(apiUrl, token, lookupPayload({ kind: "boleta", series: "B001", number: 99999999 }), fetchImpl);
  if (outcome.kind === "not_found" || outcome.kind === "issued") return { ok: true };
  if (outcome.kind === "credentials") return { ok: false, message: "Nubefact no aceptó la ruta o el token. Cópialos otra vez desde tu cuenta (Configuración → API - Integración)." };
  return { ok: false, message: "message" in outcome ? outcome.message : "No pudimos comprobar la conexión." };
}
