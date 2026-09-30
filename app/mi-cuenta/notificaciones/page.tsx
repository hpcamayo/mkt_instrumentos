import { NotificationsList } from "@/components/notifications-list";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";

export const metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const { supabase } = await getAccountContext();
  const { data } = supabase
    ? await supabase
        .from("notifications")
        .select("id,event_type,message,listing_id,store_id,claim_id,transaction_id,review_id,created_at,read_at,old_price_pen,new_price_pen")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100)
    : { data: [] };

  return (
    <section className="grid gap-5">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Notificaciones"
        meta={<p className="max-w-[68ch]">Revisa decisiones de moderación y cambios importantes de tu tienda o publicaciones.</p>}
      />
      <NotificationsList notifications={data ?? []} />
    </section>
  );
}
