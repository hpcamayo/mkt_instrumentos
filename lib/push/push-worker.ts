import "server-only";

import { randomUUID } from "node:crypto";
import { pushMessageFor, type PushNotice } from "@/lib/push/notice";
import type { PushDevice, PushSender, PushSendResult } from "@/lib/push/web-push";
import type { DatabaseClient } from "@/lib/supabase/database";

// big-12 (docs/ux-effortless/speed.md): one run of the push worker (app/api/internal/push/process). It claims people
// with pending notices, sends each person one message on every device they turned on, and reports back. Nothing is
// sent from 22:00 to 08:00 in Lima: those notices wait and go out together in the morning.

// The service role client, or a stand-in with the same calls in tests.
export type PushQueueClient = Pick<DatabaseClient, "rpc">;

export type PushBatchResult = { quiet: boolean; people: number; sent: number; retried: number; failed: number; skipped: number };
type Outcome = "sent" | "retry" | "failed" | "skipped";
type Person = { userId: string; notices: PushNotice[]; devices: PushDevice[] };

export const PUSH_QUIET_FROM_HOUR = 22;
export const PUSH_QUIET_UNTIL_HOUR = 8;

export function isPushQuietHour(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour >= PUSH_QUIET_FROM_HOUR || hour < PUSH_QUIET_UNTIL_HOUR;
}

export async function processPushBatch({
  client,
  sender,
  now = new Date(),
  workerId = randomUUID(),
  limit = 50,
}: {
  client: PushQueueClient;
  sender: PushSender;
  now?: Date;
  workerId?: string;
  limit?: number;
}): Promise<PushBatchResult> {
  const result: PushBatchResult = { quiet: false, people: 0, sent: 0, retried: 0, failed: 0, skipped: 0 };
  if (isPushQuietHour(now)) return { ...result, quiet: true };
  const { data, error } = await client.rpc("claim_push_deliveries", { p_worker_id: workerId, p_limit: limit });
  if (error) throw new Error(`PUSH_CLAIM_FAILED:${error.code ?? "unknown"}`);
  const people = Array.isArray(data) ? data.map(parsePerson) : [];
  result.people = people.length;
  for (let offset = 0; offset < people.length; offset += 5) {
    await Promise.all(people.slice(offset, offset + 5).map(async (person) => {
      if (!person) return;
      const delivery = await deliver(person, sender);
      const finished = await client.rpc("finish_push_deliveries", {
        p_worker_id: workerId,
        p_delivery_ids: person.notices.map((notice) => notice.delivery_id),
        p_outcome: delivery.outcome,
        p_failure_code: delivery.code,
        p_sent_device_ids: delivery.sent,
        p_failed_device_ids: delivery.failed,
        p_gone_device_ids: delivery.gone,
      });
      if (finished.error) {
        console.error("push_finish_failure", JSON.stringify({ user_id: person.userId, failure_code: finished.error.code ?? "unknown" }));
        return;
      }
      result[({ sent: "sent", retry: "retried", failed: "failed", skipped: "skipped" } as const)[delivery.outcome]] += 1;
    }));
  }
  return result;
}

async function deliver(person: Person, sender: PushSender) {
  if (!person.devices.length || !person.notices.length) return { outcome: "skipped" as Outcome, code: "no_device", sent: [], failed: [], gone: [] };
  const message = pushMessageFor(person.notices);
  const results = await Promise.all(person.devices.map(async (device): Promise<[string, PushSendResult]> => {
    try {
      return [device.id, await sender.send(device, message)];
    } catch {
      return [device.id, { status: "retry", code: "sender_error" }];
    }
  }));
  const devices = (status: PushSendResult["status"]) => results.filter(([, sent]) => sent.status === status).map(([id]) => id);
  const sent = devices("sent");
  const retry = devices("retry");
  const failed = devices("failed");
  const outcome: Outcome = sent.length ? "sent" : retry.length ? "retry" : failed.length ? "failed" : "skipped";
  const code = outcome === "sent" ? null : results.find(([, sent]) => sent.status !== "sent")?.[1].code ?? null;
  return { outcome, code, sent, failed, gone: devices("gone") };
}

function parsePerson(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { user_id?: unknown; notices?: unknown; devices?: unknown };
  if (typeof row.user_id !== "string" || !Array.isArray(row.notices) || !Array.isArray(row.devices)) return null;
  const notices = row.notices.filter((notice): notice is PushNotice => Boolean(notice) && typeof notice.delivery_id === "string" && typeof notice.event_type === "string" && typeof notice.message === "string");
  const devices = row.devices.filter((device): device is PushDevice => Boolean(device) && ["id", "endpoint", "p256dh", "auth"].every((key) => typeof device[key] === "string"));
  return { userId: row.user_id, notices, devices };
}
