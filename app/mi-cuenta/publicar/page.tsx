import Link from "next/link";
import { redirect } from "next/navigation";
import { SellListingForm } from "@/components/sell-listing-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { normalizePeruRegion } from "@/lib/location";

export const metadata = { title: "Publicar instrumento" };

export default async function PublishParticularPage() {
  const { profile } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/publicar");
  const complete = Boolean(profile?.full_name?.trim() && profile.phone?.trim() && profile.city?.trim() && normalizePeruRegion(profile.region));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Publicar"
        title="Publica tu instrumento usado"
        meta={<p className="max-w-[68ch]">La publicación quedará pendiente de revisión antes de aparecer en el catálogo.</p>}
      />
      {complete && profile ? <SellListingForm profile={{ fullName: profile.full_name!, phone: profile.phone!, city: profile.city!, region: profile.region }} /> : <Notice tone="warning" role="note"><h2 className="font-semibold">Completa tu perfil Particular</h2><p className="mt-2">Necesitamos tu nombre, WhatsApp y ubicación antes de publicar.</p><Link href="/mi-cuenta/perfil?next=/mi-cuenta/publicar" className="mt-4 inline-flex">Completar perfil</Link></Notice>}
    </div>
  );
}

