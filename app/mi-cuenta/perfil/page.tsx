import Link from "next/link";
import { Suspense } from "react";
import { PageContainer } from "@/components/page-container";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { requireUser } from "@/lib/auth/session";
import { normalizePeruRegion } from "@/lib/location";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

export const metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const user = await requireUser("/mi-cuenta/perfil");
  const supabase = await getSupabaseServerClient();
  const { data: profile } = supabase
    ? await supabase.from("profiles").select("full_name,phone,city,region,account_type").eq("id", user.id).maybeSingle()
    : { data: null };

  if (profile?.account_type && profile.account_type !== "seller") {
    return <PageContainer className="py-10"><p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900">La edición de perfil de tienda se implementará en su sprint correspondiente.</p></PageContainer>;
  }

  return (
    <PageContainer className="py-8">
      <div className="mx-auto max-w-2xl rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <Link href="/mi-cuenta" className="text-sm font-black text-laria-blue">← Volver a mi cuenta</Link>
        <h1 className="mt-4 text-3xl font-black text-laria-ink">Editar perfil</h1>
        <p className="mt-2 text-sm leading-6 text-laria-text-soft">Estos datos identifican al vendedor y se muestran en tus publicaciones asociadas a la cuenta.</p>
        <div className="mt-6">
          <Suspense><ProfileEditForm userId={user.id} profile={{ fullName: profile?.full_name ?? "", phone: profile?.phone ?? "", city: profile?.city ?? "", region: normalizePeruRegion(profile?.region ?? "") ?? "" }} /></Suspense>
        </div>
      </div>
    </PageContainer>
  );
}
