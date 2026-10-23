import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PublishSelection } from "@/components/store-import/publish-selection";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { getAccountContext } from "@/lib/account-context";
import { isImportSessionId } from "@/lib/store-import/route-helpers";
import { readImportSession } from "@/lib/store-import/server";

export const metadata = { title: "Publicar seleccionados" };

// stock-10: the publication step of an import, for SKU chosen in Inventario.
export default async function PublishSelectionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const { profile, store, supabase } = await getAccountContext();
  if (profile?.account_type !== "store_owner") redirect("/mi-cuenta/publicaciones");
  if (!store) redirect("/mi-cuenta/tienda");
  if (!isImportSessionId(sessionId) || !supabase) notFound();
  const session = await readImportSession(supabase as unknown as SupabaseClient, sessionId).catch(() => null);
  if (!session || session.store_id !== store.id) notFound();
  const count = session.row_count ?? 0;
  return (
    <section className="rounded-panel border border-subtle bg-white">
      <PageHeader
        className="border-b border-subtle p-5"
        eyebrow="Inventario"
        title="Publicar seleccionados"
        meta={`${count} SKU sin publicación. Agrega fotos, completa lo que falte y publícalos juntos; el stock no cambia.`}
        actions={<Link href="/mi-cuenta/tienda/inventario" className={buttonClasses({ variant: "secondary" })}>Volver al inventario</Link>}
      />
      <div className="p-5">
        <PublishSelection sessionId={session.id} />
      </div>
    </section>
  );
}
