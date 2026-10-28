import "server-only";
import { catalogEnrichmentDisabled } from "@/lib/catalog-guard";
import { reservedListingIds } from "@/lib/listing-reservations";
import { READ_BUDGETS, budgetSignal, type Deadline } from "@/lib/request-deadline";
import { createBreaker } from "@/lib/shared-aggregate";
import { createPublicReadClient } from "@/lib/supabase/public-read-client";

// talk-06 (docs/ux-effortless/maybes-reservado.md): which cards of a public list say "Reservado". The badge is optional,
// like the catalog's counts (docs/operations/catalog-recovery.md): the recovery switch skips the read before a client
// exists, it gives up at the optional budget, and three failures within ten seconds pause it for thirty. Without it the
// cards simply show no badge; the listing page still says "Reservado". Only Particular listings can be reserved, so a
// page of store listings asks nothing.
const breaker = createBreaker({ failures: 3, windowMs: 10_000, openMs: 30_000 });

export async function reservedCardIds(listings: { id: string; seller_type: string }[], deadline: Deadline): Promise<Set<string>> {
  if (catalogEnrichmentDisabled()) return new Set();
  const ids = listings.filter((listing) => listing.seller_type === "individual").map((listing) => listing.id);
  if (!ids.length || breaker.isOpen()) return new Set();
  const supabase = createPublicReadClient(deadline, READ_BUDGETS.optionalMs);
  if (!supabase) return new Set();
  const reserved = await reservedListingIds(supabase, ids, budgetSignal(deadline, READ_BUDGETS.optionalMs)).catch(() => null);
  if (!reserved) {
    // A visitor who left, or a render out of time, says nothing about the database.
    if (!deadline.signal.aborted) breaker.fail();
    return new Set();
  }
  return reserved;
}

// Tests: forget the breaker's state.
export function resetReservedCardsForTests() {
  breaker.reset();
}
