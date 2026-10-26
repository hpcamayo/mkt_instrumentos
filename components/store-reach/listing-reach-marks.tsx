import { Suspense } from "react";
import { DealerMark } from "@/components/store-reach/dealer-marks";
import { dealerForListing } from "@/lib/dealers";
import { getActiveDealers } from "@/lib/dealers-server";

type ListingForMarks = { id: string; store_id?: string | null; brand?: string | null; condition?: string | null; seller_type?: string | null };

// Feature ideas, store-reach batch (docs/feature-ideas/store-reach.md): what the batch adds under a listing's price,
// in one slot so the listing page adds one line. reach-04: "Distribuidor oficial <marca>" on a new instrument of the
// brand's authorized store. Streams in its own Suspense and renders nothing when there is nothing to say.
export function ListingReachMarks({ listing }: { listing: ListingForMarks }) {
  return (
    <Suspense fallback={null}>
      <Marks listing={listing} />
    </Suspense>
  );
}

async function Marks({ listing }: { listing: ListingForMarks }) {
  const dealer = dealerForListing(await getActiveDealers(), listing);
  if (!dealer) return null;
  return <DealerMark dealer={dealer} />;
}
