import { AccountSettingsTabs } from "@/components/account-settings-tabs";
import { EmailPreferences } from "@/components/email-preferences";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { parseAccountFollows } from "@/lib/follows";

export const metadata = { title: "Correos" };

export default async function EmailSettingsPage() {
  const { supabase, user } = await getAccountContext();
  const [preferences, alerts, follows] = supabase
    ? await Promise.all([
        supabase.from("email_preferences").select("price_drop_emails,follow_digest_emails").eq("user_id", user.id).maybeSingle(),
        supabase.from("saved_search_alerts").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active").is("deleted_at", null),
        supabase.rpc("get_account_follows"),
      ])
    : [null, null, null];
  const failed = !preferences || preferences.error;

  return (
    <>
      <AccountSettingsTabs current="/mi-cuenta/correos" />
      <div className="grid max-w-2xl gap-5">
        <PageHeader title="Correos" meta="Elige qué te escribimos. Cada correo opcional trae también un enlace para dejar de recibirlo." />
        {failed ? (
          <Notice tone="danger" role="alert">No pudimos cargar tus preferencias. Intenta nuevamente.</Notice>
        ) : (
          <EmailPreferences
            priceDrops={preferences.data?.price_drop_emails ?? true}
            followDigest={preferences.data?.follow_digest_emails ?? false}
            activeAlerts={alerts?.count ?? 0}
            follows={parseAccountFollows(follows?.data)}
          />
        )}
      </div>
    </>
  );
}
