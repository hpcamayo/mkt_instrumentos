import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ListingTermsManager, PolicyForm, type TermsListing } from "@/components/store-floor/warranty-forms";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { CONDITION_GROUPS, conditionGroup, type ConditionGroup, type StoreTerms } from "@/lib/store-floor/warranty";

export const metadata = { title: "Garantía y cambios" };

// reach-09: the store says its warranty and returns once per condition; every listing shows the line next to the
// price and buyers can filter by "Con garantía". The promise is the store's.
export default async function StoreWarrantyPage() {
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store || !supabase) redirect("/mi-cuenta/tienda");
  const db = supabase as unknown as SupabaseClient;
  const writable = ["pending", "active"].includes(store.status);
  const [{ data: policies }, { data: listings }] = await Promise.all([
    db.from("store_warranty_policies").select("condition_group,warranty_months,warranty_provider,returns_days,returns_note").eq("store_id", store.id),
    db.from("listings")
      .select("id,title,condition,status,warranty_months,warranty_provider,returns_days,returns_note,store_terms_source")
      .eq("store_id", store.id)
      .in("status", ["draft", "pending", "approved", "hidden"])
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const byGroup = new Map(((policies ?? []) as (StoreTerms & { condition_group: ConditionGroup })[]).map((row) => [row.condition_group, row]));
  const rows = (listings ?? []) as TermsListing[];
  const counts = new Map<ConditionGroup, number>();
  for (const listing of rows) {
    const group = conditionGroup(listing.condition);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return (
    <div className="grid w-full max-w-3xl gap-6">
      <PageHeader
        eyebrow="Mi tienda"
        title="Garantía y cambios"
        meta={<p className="max-w-[68ch]">Dilo una vez por condición: cada publicación lo muestra junto al precio y quien busca puede filtrar por “Con garantía”. Es la promesa de tu tienda; Laria la muestra tal como la escribes.</p>}
      />
      {!writable ? <Notice tone="warning" role="note">Tu tienda no puede cambiar su garantía en este momento.</Notice> : null}
      {writable ? (
        <>
          {CONDITION_GROUPS.map((group) => (
            <PolicyForm key={group.value} group={group.value} label={group.label} hint={group.hint} initial={byGroup.get(group.value) ?? null} listingCount={counts.get(group.value) ?? 0} />
          ))}
          {rows.length ? <ListingTermsManager listings={rows} /> : null}
        </>
      ) : null}
      <p className="t-meta max-w-[68ch]">
        La garantía legal que corresponde por ley se mantiene aunque elijas “Sin garantía adicional” o “No acepta cambios”. Si tienes dudas sobre lo que debes ofrecer, consulta las normas de protección al consumidor.
      </p>
    </div>
  );
}
