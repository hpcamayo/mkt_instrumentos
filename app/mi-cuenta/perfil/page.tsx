import { Suspense } from "react";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { getAccountContext } from "@/lib/account-context";
import { normalizePeruRegion } from "@/lib/location";

export const metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const { user, profile } = await getAccountContext();
  const accountType = profile?.account_type === "store_owner" ? "store_owner" : "seller";

  return (
      <div className="max-w-2xl rounded-lg border border-laria-fog bg-white p-5 shadow-sm sm:p-6">
        <h1 className="text-3xl font-black text-laria-ink">Editar perfil</h1>
        <p className="mt-2 text-sm leading-6 text-laria-text-soft">Estos datos identifican {accountType === "store_owner" ? "a la persona responsable de la tienda" : "al Particular y se muestran en sus publicaciones"}.</p>
        <div className="mt-6">
          <Suspense><ProfileEditForm userId={user.id} accountType={accountType} profile={{ fullName: profile?.full_name ?? "", phone: profile?.phone ?? "", city: profile?.city ?? "", region: normalizePeruRegion(profile?.region ?? "") ?? "" }} /></Suspense>
        </div>
      </div>
  );
}
