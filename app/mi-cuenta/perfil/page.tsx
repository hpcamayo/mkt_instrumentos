import { Suspense } from "react";
import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { ProfileEditForm } from "@/components/profile-edit-form";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { normalizePeruRegion } from "@/lib/location";

export const metadata = { title: "Editar perfil" };

export default async function ProfilePage() {
  const { user, profile } = await getAccountContext();
  const accountType = profile?.account_type === "store_owner" ? "store_owner" : "seller";

  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/perfil" />
      <div className="max-w-2xl rounded-panel border border-subtle bg-white p-5 sm:p-6">
        <PageHeader
          title="Editar perfil"
          meta={`Estos datos identifican ${accountType === "store_owner" ? "a la persona responsable de la tienda" : "al Particular y se muestran en sus publicaciones"}.`}
        />
        <div className="mt-6">
          <Suspense><ProfileEditForm userId={user.id} accountType={accountType} profile={{ fullName: profile?.full_name ?? "", phone: profile?.phone ?? "", city: profile?.city ?? "", region: normalizePeruRegion(profile?.region ?? "") ?? "" }} /></Suspense>
        </div>
      </div>
    </>
  );
}
