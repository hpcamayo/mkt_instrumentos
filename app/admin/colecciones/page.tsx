import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AdminCollectionEditor } from "@/components/discovery/admin-collection-editor";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { requireAdmin } from "@/lib/admin-server";
import { COLLECTION_STATE_LABELS, collectionPath, collectionState, limaToday, parseCollections } from "@/lib/discovery/collections";

export const metadata = { title: "Colecciones" };

// disc-03 Admin (docs/feature-ideas/discovery.md): create, date, publish and remove collections. Every change is
// audited (admin_save_collection, admin_delete_collection).
export default async function AdminCollectionsPage() {
  const { supabase } = await requireAdmin("/admin/colecciones");
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from("collections")
    .select("id, slug, title, intro, sets, starts_on, ends_on, published, sort_order")
    .order("sort_order");
  const collections = parseCollections(data);
  const today = limaToday();
  return (
    <div className="grid gap-6">
      <PageHeader title="Colecciones" meta={<p className="max-w-[68ch]">Grupos de publicaciones con título, texto y fechas. Se muestran en el inicio y en /colecciones mientras estén publicadas y dentro de sus fechas.</p>} />
      {error ? <Notice tone="danger">No pudimos cargar las colecciones. No asumiremos que no hay ninguna.</Notice> : null}
      <details className="rounded-panel border border-subtle bg-white p-4">
        <summary className="cursor-pointer t-section text-ink">Nueva colección</summary>
        <div className="mt-4"><AdminCollectionEditor collection={null} /></div>
      </details>
      <ul className="grid gap-4">
        {collections.map((collection) => {
          const state = collectionState(collection, today);
          return (
            <li key={collection.id} className="rounded-panel border border-subtle bg-white p-4">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="t-section text-ink">{collection.title}</span>
                  <Tag tone={state === "live" ? "accent" : "line"}>{COLLECTION_STATE_LABELS[state]}</Tag>
                  <span className="t-meta">{[collection.starts_on, collection.ends_on].filter(Boolean).join(" a ") || "Sin fechas"}</span>
                </summary>
                <p className="mt-2 t-meta"><Link href={collectionPath(collection.slug)} className="link">{collectionPath(collection.slug)}</Link></p>
                <div className="mt-4"><AdminCollectionEditor collection={collection} /></div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
