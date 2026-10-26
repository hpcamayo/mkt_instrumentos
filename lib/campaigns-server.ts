import "server-only";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { parseLiveCampaignMarks, type LiveCampaignMark } from "@/lib/campaigns";
import { READ_BUDGETS, createDeadline, type Deadline } from "@/lib/request-deadline";
import { sharedAggregate } from "@/lib/shared-aggregate";
import { storeReachDb } from "@/lib/store-reach-db";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// reach-05 "Campañas Laria": the publications in a live campaign are one small public list, read once and shared for
// ten minutes by every listing page (lib/shared-aggregate.ts), so the campaign line adds no query per visit. The job
// starts and ends entries every ten minutes too; campaignMarkForListing hides a line whose price no longer matches.
// Admin's changes refresh it at once (revalidateTag(CAMPAIGNS_CACHE_TAG)). The catalog recovery switch turns it off.

export const CAMPAIGNS_CACHE_TAG = "store-reach-campaigns-v1";

async function loadMarks(deadline: Deadline) {
  const supabase = createPublicReadClient(deadline);
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await storeReachDb(supabase).rpc("get_live_campaign_marks");
  if (error) throw new Error(error.message);
  return parseLiveCampaignMarks(data);
}

const marks = sharedAggregate<[], LiveCampaignMark[]>({
  key: CAMPAIGNS_CACHE_TAG,
  revalidateSeconds: 600,
  load: loadMarks,
  loadBudgetMs: READ_BUDGETS.coreMs,
});

export async function getLiveCampaignMarks(signal?: AbortSignal): Promise<LiveCampaignMark[]> {
  if (catalogEnrichmentDisabled()) return [];
  return (await marks.get(signal ?? createDeadline(READ_BUDGETS.optionalMs).signal)) ?? [];
}
