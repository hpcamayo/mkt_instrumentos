import Link from "next/link";
import { redirect } from "next/navigation";
import { SellListingForm } from "@/components/sell-listing-form";
import { DraftList } from "@/components/selling/draft-list";
import { SellToStorePrompt } from "@/components/offers/sell-to-store-prompt";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { normalizePeruRegion } from "@/lib/location";
import { listSellDrafts, loadSellBrands, loadSellPageData } from "@/lib/sell-page-data";

export const metadata = { title: "Publicar instrumento" };

export default async function PublishParticularPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/publicar");
  const complete = Boolean(profile?.full_name?.trim() && profile.phone?.trim() && profile.city?.trim() && normalizePeruRegion(profile.region));
  const params = (await searchParams) ?? {};
  const [data, drafts, brandsByCategory] = complete && supabase
    ? await Promise.all([
      loadSellPageData(supabase, { kind: "listing", params }),
      listSellDrafts(supabase, "listing"),
      loadSellBrands(),
    ])
    : [null, [], {}];
  const otherDrafts = drafts.filter((draft) => draft.id !== data?.serverDraft?.id);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Publicar"
        title={data?.serverDraft ? "Termina tu publicación" : "Publica tu instrumento usado"}
        meta={<p className="max-w-[68ch]">Empieza por las fotos; lo demás toma un par de minutos. La publicación se revisa antes de aparecer en el catálogo.</p>}
      />
      {data?.draftMissing ? <Notice tone="warning" role="note">Ese borrador ya no existe: puede que ya lo hayas publicado o descartado.</Notice> : null}
      {complete && profile && data ? <>
        {data.serverDraft ? null : <SellToStorePrompt supabase={supabase} region={normalizePeruRegion(profile.region)} />}
        {/* key: opening another draft from the drafts list starts a fresh form. */}
        <SellListingForm
          key={data.serverDraft?.id ?? "nuevo"}
          ownerId={user.id}
          profile={{ fullName: profile.full_name!, phone: profile.phone!, city: profile.city!, region: profile.region }}
          brandsByCategory={brandsByCategory}
          serverDraft={data.serverDraft}
          reviewWaitMinutes={data.reviewWaitMinutes}
        />
        <DraftList drafts={otherDrafts} href="/mi-cuenta/publicar" title={data.serverDraft ? "Otros borradores" : "Borradores"} />
      </> : <Notice tone="warning" role="note"><h2 className="font-semibold">Completa tu perfil Particular</h2><p className="mt-2">Necesitamos tu nombre, WhatsApp y ubicación antes de publicar.</p><Link href="/mi-cuenta/perfil?next=/mi-cuenta/publicar" className="mt-4 inline-flex">Completar perfil</Link></Notice>}
    </div>
  );
}
