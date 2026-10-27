import { runSellingJob } from "@/lib/selling-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// sell-02 and run-04: expires requests nobody chose, closes stale accepted ones, removes unused photos.
export function GET(request: Request) {
  return runSellingJob(request, "trade-offers");
}
