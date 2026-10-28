import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ImportWizard } from "@/components/store-import/import-wizard";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { isImportSessionId } from "@/lib/store-import/route-helpers";
import { nextFor, readImportSession } from "@/lib/store-import/server";

export const metadata = { title: "Importar desde Excel" };

export default async function StoreImportSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  if (!isImportSessionId(sessionId) || !supabase) notFound();
  const session = await readImportSession(supabase, sessionId).catch(() => null);
  if (!session || session.store_id !== store.id) notFound();
  if (session.options?.source === "inventory_selection") redirect(`/mi-cuenta/tienda/publicar-seleccionados/${session.id}`);

  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Inventario"
        title="Importar desde Excel"
        actions={<Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary" })}>Volver al inventario</Link>}
      />
      <div className="p-5">
        <ImportWizard initialSession={session} initialNext={nextFor(session)} />
      </div>
    </section>
  );
}
