import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GearActions } from "@/components/gear/gear-actions";
import { GearItemForm } from "@/components/gear/gear-item-form";
import { GearReminderPanel } from "@/components/gear/gear-reminder-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { getAccountContext } from "@/lib/account-context";
import { GEAR_COLUMNS, gearKindLabel, isTradeCategory, sellingDb, todayInLima, warrantyStatus, type GearItem, type GearReminder } from "@/lib/selling-tools";

export const metadata = { title: "Mi equipo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function GearItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { profile, supabase } = await getAccountContext();
  if (profile?.account_type === "store_owner") redirect("/mi-cuenta");
  if (!supabase) notFound();
  const [{ data: itemRow }, { data: reminderRow }] = await Promise.all([
    sellingDb(supabase).from("gear_items").select(GEAR_COLUMNS).eq("id", id).maybeSingle(),
    sellingDb(supabase).from("gear_reminders").select("gear_item_id,kind,every_months,last_changed_on,next_due_on").eq("gear_item_id", id).maybeSingle(),
  ]);
  const item = itemRow as unknown as GearItem | null;
  if (!item) notFound();
  const reminder = reminderRow as unknown as GearReminder | null;
  const { data: storesBuying } = isTradeCategory(item.category) && profile?.region
    ? await sellingDb(supabase).rpc("count_trade_stores", { p_category: item.category, p_region: profile.region })
    : { data: 0 };
  const warranty = warrantyStatus(item.warranty_until, todayInLima());

  return (
    <section className="grid min-w-0 gap-6">
      <PageHeader
        eyebrow={<Link href="/mi-cuenta/equipo" className="underline decoration-line-deco underline-offset-[3px]">Mi equipo</Link>}
        title={item.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span>{gearKindLabel(item)}</span>
            {item.source === "purchase" ? <Tag tone="accent">Compra confirmada en Laria</Tag> : null}
            {warranty ? <Tag tone={warranty.tone === "warning" ? "warning" : "neutral"}>{warranty.label}</Tag> : null}
          </div>
        }
      />
      <GearActions item={item} storesBuying={Number(storesBuying) || 0} />
      <GearReminderPanel item={item} reminder={reminder} />
      <section aria-labelledby="datos-equipo" className="grid gap-3 rounded-panel border border-subtle bg-surface p-5">
        <h2 id="datos-equipo" className="t-section text-ink">Datos del equipo</h2>
        <GearItemForm item={item} />
      </section>
    </section>
  );
}
