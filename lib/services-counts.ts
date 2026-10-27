import "server-only";
import { READ_BUDGETS, createDeadline, type Deadline } from "@/lib/request-deadline";
import { SERVICE_CATEGORIES, type ServiceCategory } from "@/lib/services";
import { servicesDb } from "@/lib/services-db";
import { sharedAggregate } from "@/lib/shared-aggregate";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// feature-ideas services (bet-02): how many public services each kind has, for the entry points outside /servicios
// (the home teaser, the repair line on used gear). Shared for five minutes (lib/shared-aggregate.ts), so a busy home or
// listing page never adds a query per view. Null when unavailable: callers then show nothing.

export type ServiceKindCounts = { total: number; categories: Partial<Record<ServiceCategory, number>> };

const SECONDS = 300;

async function loadServiceKindCounts(deadline: Deadline): Promise<ServiceKindCounts> {
  const supabase = createPublicReadClient(deadline);
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await servicesDb(supabase).rpc("get_service_directory_counts", { p_category: null });
  if (error) throw new Error(error.message);
  const row = data && typeof data === "object" && !Array.isArray(data) ? (data as { total?: unknown; categories?: Record<string, unknown> }) : {};
  const categories: Partial<Record<ServiceCategory, number>> = {};
  for (const category of SERVICE_CATEGORIES) {
    const count = row.categories?.[category];
    if (typeof count === "number" && count > 0) categories[category] = count;
  }
  return { total: typeof row.total === "number" ? row.total : 0, categories };
}

const serviceKindCounts = sharedAggregate<[], ServiceKindCounts>({
  key: "service-kind-counts-v1",
  revalidateSeconds: SECONDS,
  load: loadServiceKindCounts,
  loadBudgetMs: READ_BUDGETS.coreMs,
});

export async function getServiceKindCounts(signal?: AbortSignal): Promise<ServiceKindCounts | null> {
  return serviceKindCounts.get(signal ?? createDeadline(READ_BUDGETS.optionalMs).signal);
}

export function resetServiceKindCountsForTests() {
  serviceKindCounts.reset();
}
