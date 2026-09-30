import { statusLabel } from "@/lib/ui/status";

// Listing status labels come from the one status dictionary (lib/ui/status.ts).
export function listingStatusLabel(status: string) {
  return statusLabel("listing", status);
}
