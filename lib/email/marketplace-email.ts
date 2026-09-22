import "server-only";

import { randomUUID } from "node:crypto";
import { createMarketplaceEmailProvider, MarketplaceEmailProviderError, type MarketplaceEmailProvider } from "@/lib/email/provider";
import { parseMarketplaceEmailPayload, renderMarketplaceEmail } from "@/lib/email/templates";
import { getSupabaseAdminClient } from "@/lib/supabase/admin-client";

type RpcError = { message: string; code?: string };
export type MarketplaceEmailQueueClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

export type MarketplaceEmailBatchResult = { claimed: number; sent: number; retried: number; failed: number; invalid: number };

export async function prepareDueLimaDayDigests(client: MarketplaceEmailQueueClient, now = new Date()) {
  const { localDate, hour } = limaClock(now);
  if (hour < 8) return 0;
  let prepared = 0;
  let digestDate = localDate;
  // Replaying a bounded week makes scheduler outages recoverable without ever
  // combining different Lima calendar days into one digest. Database dedupe
  // makes every replay safe.
  for (let daysAgo = 1; daysAgo <= 7; daysAgo += 1) {
    digestDate = previousCalendarDate(digestDate);
    const { data, error } = await client.rpc("prepare_daily_search_alert_emails", { p_digest_date: digestDate, p_limit: 100 });
    if (error) throw new Error(`EMAIL_DIGEST_PREPARE_FAILED:${error.code ?? "unknown"}`);
    prepared += typeof data === "number" ? data : 0;
  }
  return prepared;
}

export async function processMarketplaceEmailBatch({
  client = getSupabaseAdminClient() as unknown as MarketplaceEmailQueueClient | null,
  provider = createMarketplaceEmailProvider(),
  baseUrl = process.env.MARKETPLACE_EMAIL_BASE_URL,
  workerId = randomUUID(),
  limit = 25,
}: {
  client?: MarketplaceEmailQueueClient | null;
  provider?: MarketplaceEmailProvider;
  baseUrl?: string;
  workerId?: string;
  limit?: number;
} = {}): Promise<MarketplaceEmailBatchResult> {
  if (!client) throw new Error("EMAIL_DATABASE_CONFIG_MISSING");
  if (!baseUrl) throw new Error("EMAIL_BASE_URL_MISSING");
  const { data, error } = await client.rpc("claim_marketplace_email_deliveries", { p_worker_id: workerId, p_limit: limit });
  if (error) throw new Error(`EMAIL_CLAIM_FAILED:${error.code ?? "unknown"}`);
  const rows = Array.isArray(data) ? data : [];
  const result: MarketplaceEmailBatchResult = { claimed: rows.length, sent: 0, retried: 0, failed: 0, invalid: 0 };
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async (value) => {
      const payload = parseMarketplaceEmailPayload(value);
      if (!payload) {
        result.invalid += 1;
        await failDelivery(client, value, workerId, false, "template", "payload_invalid", result);
        return;
      }
      try {
        const rendered = renderMarketplaceEmail(payload, baseUrl);
        const providerResult = await provider.send({
          to: payload.recipient_email,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: payload.delivery_id,
        });
        const completed = await client.rpc("complete_marketplace_email_delivery", {
          p_delivery_id: payload.delivery_id,
          p_worker_id: workerId,
          p_provider_message_id: providerResult.messageId,
        });
        if (completed.error) {
          logMarketplaceEmailFailure(payload.delivery_id, "completion", completed.error.code ?? "unknown");
          return;
        }
        result.sent += 1;
      } catch (caught) {
        const providerError = caught instanceof MarketplaceEmailProviderError ? caught : null;
        const templateError = caught instanceof Error && /^EMAIL_/.test(caught.message);
        await failDelivery(
          client,
          payload.delivery_id,
          workerId,
          providerError?.retryable ?? !templateError,
          providerError?.category ?? (templateError ? "template" : "unknown"),
          providerError?.code ?? (templateError ? caught.message.slice(0, 200) : "send_unknown"),
          result,
        );
      }
    }));
  }
  return result;
}

export function logMarketplaceEmailFailure(deliveryId: string, category: string, code: string) {
  console.error("marketplace_email_failure", JSON.stringify({ delivery_id: deliveryId, failure_category: category, failure_code: code }));
}

async function failDelivery(
  client: MarketplaceEmailQueueClient,
  value: unknown,
  workerId: string,
  retryable: boolean,
  category: string,
  code: string,
  result: MarketplaceEmailBatchResult,
) {
  const deliveryId = typeof value === "string" ? value : isRecord(value) && typeof value.delivery_id === "string" ? value.delivery_id : "";
  if (!deliveryId) return;
  const failed = await client.rpc("fail_marketplace_email_delivery", {
    p_delivery_id: deliveryId,
    p_worker_id: workerId,
    p_retryable: retryable,
    p_failure_category: category,
    p_failure_code: code.slice(0, 200),
  });
  if (failed.error) {
    logMarketplaceEmailFailure(deliveryId, "failure_record", failed.error.code ?? "unknown");
    return;
  }
  if (failed.data === "retry") result.retried += 1;
  else result.failed += 1;
  logMarketplaceEmailFailure(deliveryId, category, code);
}

function limaClock(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { localDate: `${read("year")}-${read("month")}-${read("day")}`, hour: Number(read("hour")) };
}

function previousCalendarDate(localDate: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  return previous.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
