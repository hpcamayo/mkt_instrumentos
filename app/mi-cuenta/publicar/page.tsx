import Link from "next/link";
import { redirect } from "next/navigation";
import { SellListingForm } from "@/components/sell-listing-form";
import { getAccountContext } from "@/lib/account-context";
import { normalizePeruRegion } from "@/lib/location";

export const metadata = { title: "Publicar instrumento" };

export default async function PublishParticularPage() {
  const { profile } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta/tienda/publicar");
  const complete = Boolean(profile?.full_name?.trim() && profile.phone?.trim() && profile.city?.trim() && normalizePeruRegion(profile.region));
  return (
    <div className="space-y-6">
      <div><p className="text-sm font-black uppercase tracking-wide text-laria-blue">Publicar</p><h1 className="mt-2 text-3xl font-black text-laria-ink">Publica tu instrumento usado</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-laria-text-soft">La publicación quedará pendiente de revisión antes de aparecer en el catálogo.</p></div>
      {complete && profile ? <SellListingForm profile={{ fullName: profile.full_name!, phone: profile.phone!, city: profile.city!, region: profile.region }} /> : <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><h2 className="font-black">Completa tu perfil Particular</h2><p className="mt-2">Necesitamos tu nombre, WhatsApp y ubicación antes de publicar.</p><Link href="/mi-cuenta/perfil?next=/mi-cuenta/publicar" className="mt-4 inline-flex font-black text-laria-blue">Completar perfil</Link></section>}
    </div>
  );
}

