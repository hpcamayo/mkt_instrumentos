import { redirect } from "next/navigation";
import { ConsignmentAccept } from "@/components/offers/consignment-accept";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { sellingDb } from "@/lib/selling-tools";

export const metadata = { title: "Consignación" };

type Invite = {
  listing: { id: string; title: string; slug: string; price_pen: number | null; status: string };
  store: { name: string; slug: string; city: string | null; is_verified: boolean };
  expires_at: string;
};

// sell-03: the owner opens the link the store sent by WhatsApp and links the listing to their account.
export default async function ConsignmentInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta");
  const { data } = supabase && /^[0-9a-f]{64}$/.test(token) ? await sellingDb(supabase).rpc("get_consignment_invite", { p_token: token }) : { data: null };
  const invite = data as Invite | null;
  return (
    <section className="grid min-w-0 gap-5">
      <PageHeader eyebrow="Mi equipo" title="Consignación" />
      {invite ? (
        <ConsignmentAccept token={token} invite={invite} />
      ) : (
        <EmptyState
          title="El enlace venció o ya se usó"
          description="Pide a la tienda que te envíe uno nuevo. Cada enlace dura 7 días y sirve una vez."
          actions={<Button href="/mi-cuenta/equipo" variant="secondary">Ir a Mi equipo</Button>}
        />
      )}
    </section>
  );
}
