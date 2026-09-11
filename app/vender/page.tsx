import Link from "next/link";
import type { Metadata } from "next";
import { PageContainer } from "@/components/page-container";
import { SellListingForm } from "@/components/sell-listing-form";
import { requireUser } from "@/lib/auth/session";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata: Metadata = {
  title: "Vender instrumento",
  description:
    "Publica tu instrumento usado para revisión y conecta con compradores por WhatsApp.",
  openGraph: {
    title: "Vende tu instrumento usado",
    description:
      "Envía tu publicación para revisión y aparece en Instrumentos Perú cuando sea aprobada.",
    url: "/vender",
  },
};

export default async function SellPage() {
  const user = await requireUser("/vender");
  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase
        .from("profiles")
        .select("full_name,phone,city,region,account_type")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isCompleteParticular = Boolean(
    profile?.account_type === "seller" &&
      profile.full_name?.trim() &&
      profile.phone?.trim() &&
      profile.city?.trim() &&
      normalizePeruRegion(profile.region),
  );

  if (profile?.account_type === "store_owner") {
    return (
      <PageContainer as="section" className="py-10">
        <div className="mx-auto max-w-2xl rounded-lg border border-laria-fog bg-white p-6">
          <h1 className="text-2xl font-black text-laria-ink">Esta cuenta publica como Tienda</h1>
          <p className="mt-3 text-sm leading-6 text-laria-text-soft">
            `/vender` está reservado para publicaciones de una cuenta Particular. Usa el inventario de tu tienda para mantener separadas ambas identidades.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/mi-cuenta/tienda/publicar" className="laria-button-primary min-h-11 px-4 py-3 text-sm">Agregar inventario</Link>
            <Link href="/mi-cuenta" className="laria-button-secondary min-h-11 px-4 py-3 text-sm">Volver a Mi cuenta</Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer as="section" className="py-6">
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-brass">
            Vender
          </p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            Publica tu instrumento usado
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Completa los datos del instrumento y envía tu publicación para
            revisión. Cuando sea aprobada, aparecerá en los listados públicos.
          </p>
        </div>
        {isCompleteParticular && profile ? (
          <SellListingForm
            profile={{
              fullName: profile.full_name!,
              phone: profile.phone!,
              city: profile.city!,
              region: profile.region,
            }}
          />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            <h2 className="font-black">Completa tu perfil de Particular</h2>
            <p className="mt-2">
              Necesitamos tu nombre, WhatsApp, ciudad y región antes de crear
              una publicación asociada a tu cuenta.
            </p>
            <Link
              href="/mi-cuenta/perfil?next=/vender"
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-laria-black px-4 py-2 font-black text-white"
            >
              Completar perfil
            </Link>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
