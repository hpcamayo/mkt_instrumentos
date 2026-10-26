import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoreGiftForm, StoreMakerForm, type StoreGiftPolicy, type StoreMakerProfile } from "@/components/discovery/store-maker-form";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { GIFTS_PATH } from "@/lib/discovery/gift-finder";
import { MAKERS_PATH } from "@/lib/discovery/makers";

export const metadata = { title: "Taller y regalos" };

// disc-04 and buy-05 (docs/feature-ideas/discovery.md): a store marks itself Fabricante or Taller for Hecho en Perú,
// and says whether it accepts gift exchanges. Both are off until the owner turns them on.
export default async function StoreMakerPage() {
  const { profile, store, supabase } = await getAccountContext();
  const eligible = profile?.account_type === "store_owner" && store && ["pending", "active"].includes(store.status);
  const db = supabase as unknown as SupabaseClient | null;
  const [maker, gift] = eligible && db
    ? await Promise.all([
        db.from("store_maker_profiles").select("kind,craft_city,story,since_year,hidden_reason").eq("store_id", store.id).maybeSingle(),
        db.from("store_gift_policies").select("exchange_days,note").eq("store_id", store.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  return (
    <div className="grid w-full max-w-3xl gap-8">
      <PageHeader
        eyebrow="Mi tienda"
        title="Taller y regalos"
        meta={<p className="max-w-[68ch]">Si haces tus instrumentos, cuéntalo en <Link href={MAKERS_PATH} className="link">Hecho en Perú</Link>. Si aceptas cambios de regalos, apareces en <Link href={GIFTS_PATH} className="link">Para regalar</Link>.</p>}
      />
      {eligible ? (
        <>
          <section aria-labelledby="taller-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-4 md:p-5">
            <h2 id="taller-titulo" className="t-section text-ink">Fabricante o taller</h2>
            <StoreMakerForm profile={(maker.data as StoreMakerProfile) ?? null} defaultCity={store.city ?? ""} />
          </section>
          <section aria-labelledby="regalos-titulo" className="grid gap-3 rounded-panel border border-subtle bg-white p-4 md:p-5">
            <h2 id="regalos-titulo" className="t-section text-ink">Cambios de regalos</h2>
            <StoreGiftForm policy={(gift.data as StoreGiftPolicy) ?? null} />
          </section>
        </>
      ) : (
        <Notice tone="warning" role="note">Necesitas una cuenta de Tienda con una solicitud pendiente o aprobada.</Notice>
      )}
    </div>
  );
}
