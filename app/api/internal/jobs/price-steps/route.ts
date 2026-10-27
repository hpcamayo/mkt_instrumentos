import { runSellingJob } from "@/lib/selling-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// sell-04: lowers due prices one step (once a day is enough; steps are 7 or 14 days apart).
export function GET(request: Request) {
  return runSellingJob(request, "price-steps");
}
