import { Suspense } from "react";
import { CampaignMark } from "@/components/store-reach/campaign-mark";
import { DealerMark } from "@/components/store-reach/dealer-marks";
import { campaignMarkForListing } from "@/lib/campaigns";
import { getLiveCampaignMarks } from "@/lib/campaigns-server";
import { dealerForListing } from "@/lib/dealers";
import { getActiveDealers } from "@/lib/dealers-server";

type ListingForMarks = {
  id: string;
  price_pen: number | null;
  status?: string | null;
  store_id?: string | null;
  brand?: string | null;
  condition?: string | null;
  seller_type?: string | null;
};

// Feature ideas, store-reach batch (docs/feature-ideas/store-reach.md): what the batch adds under a listing's price,
// in one slot so the listing page adds one line. reach-05: the campaign the publication is in and the reference Laria
// checked; reach-04: "Distribuidor oficial <marca>" on a new instrument of the brand's authorized store. Streams in
// its own Suspense and renders nothing when there is nothing to say.
export function ListingReachMarks({ listing }: { listing: ListingForMarks }) {
  return (
    <Suspense fallback={null}>
      <Marks listing={listing} />
    </Suspense>
  );
}

async function Marks({ listing }: { listing: ListingForMarks }) {
  const [dealers, campaigns] = await Promise.all([getActiveDealers(), getLiveCampaignMarks()]);
  const dealer = dealerForListing(dealers, listing);
  const campaign = campaignMarkForListing(campaigns, listing);
  if (!dealer && !campaign) return null;
  return (
    <>
      {campaign ? <CampaignMark mark={campaign} /> : null}
      {dealer ? <DealerMark dealer={dealer} /> : null}
    </>
  );
}
