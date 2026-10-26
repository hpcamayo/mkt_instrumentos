import Link from "next/link";
import { BuyerTryoutList } from "@/components/store-floor/tryout-agenda";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { getSiteUrl } from "@/lib/site";
import { loadBuyerTryouts } from "@/lib/store-floor/tryouts-server";

export const metadata = { title: "Mis pruebas" };

// buy-07: the try-outs a buyer asked for, with cancel, WhatsApp to the store and "Agregar al calendario".
export default async function BuyerTryoutsPage() {
  const { user, supabase } = await getAccountContext();
  const { upcoming, past } = supabase ? await loadBuyerTryouts(supabase, user.id) : { upcoming: [], past: [] };
  return (
    <div className="grid w-full max-w-3xl gap-6">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mis pruebas"
        meta={<p className="max-w-[68ch]">Los horarios que pediste para probar instrumentos en tiendas. Una prueba reserva un horario, no el instrumento; puedes cancelarla cuando quieras.</p>}
      />
      {upcoming.length || past.length ? (
        <BuyerTryoutList upcoming={upcoming} past={past} siteUrl={getSiteUrl()} />
      ) : (
        <EmptyState
          title="Aún no pediste pruebas"
          description="En las publicaciones de tiendas que reciben pruebas verás “Reservar una prueba”."
          actions={<Link href="/listados" className={buttonClasses({ variant: "secondary" })}>Explorar el catálogo</Link>}
        />
      )}
    </div>
  );
}
