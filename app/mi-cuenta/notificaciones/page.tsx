import { NotificationsList } from "@/components/notifications-list";
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
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-laria-blue">Mi cuenta</p>
        <h1 className="mt-1 text-3xl font-black text-laria-ink">Notificaciones</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-laria-text-soft">
          Revisa decisiones de moderación y cambios importantes de tu tienda o publicaciones.
        </p>
      </div>
      <NotificationsList notifications={data ?? []} />
    </section>
  );
}
