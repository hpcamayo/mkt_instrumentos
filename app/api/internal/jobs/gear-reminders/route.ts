import { runSellingJob } from "@/lib/selling-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// buy-06: sends due string, reed and drumhead reminders (one per item and due date).
export function GET(request: Request) {
  return runSellingJob(request, "gear-reminders");
}
