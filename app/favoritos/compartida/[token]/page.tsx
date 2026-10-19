import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { PageContainer } from "@/components/page-container";
import { SavedCard } from "@/components/saving/saved-card";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { parseSharedFavoriteList } from "@/lib/favorites";
import { NOINDEX_ROBOTS } from "@/lib/site";
import { getSupabaseServerClient } from "@/lib/supabase/server-client";

const loadList = cache(async (token: string) => {
  if (!/^[0-9a-f]{24}$/.test(token)) return null;
  const supabase = await getSupabaseServerClient();
  const { data, error } = supabase ? await supabase.rpc("get_shared_favorite_list", { p_token: token }) : { data: null, error: true };
  return error ? null : parseSharedFavoriteList(data);
});

function listTitle(ownerName: string | null) {
  return ownerName ? `La lista de ${ownerName}` : "Una lista de instrumentos";
}

// Opens well in WhatsApp: the owner's first name, the count and the first photo.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const list = await loadList(token);
  if (!list) return { title: "Lista no disponible", robots: NOINDEX_ROBOTS };
  const title = `${listTitle(list.owner_name)} en Laria`;
  const description = list.items.length === 1 ? "1 instrumento guardado." : `${list.items.length} instrumentos guardados.`;
  const image = list.items.find((item) => item.image_url)?.image_url;
  return { title, description, robots: NOINDEX_ROBOTS, openGraph: { title, description, ...(image ? { images: [image] } : {}) } };
}

// save-11: a shared favorites list. Public listings only, with the owner's notes.
export default async function SharedFavoritesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const list = await loadList(token);
  return (
    <PageContainer as="section" className="grid gap-6 py-8 sm:py-10">
      {!list ? (
        <EmptyState title="Esta lista ya no se comparte" description="Quien la compartió dejó de hacerlo o el enlace está incompleto." actions={<Link href="/listados" className={buttonClasses({ variant: "secondary" })}>Explorar el catálogo</Link>} />
      ) : (
        <>
          <PageHeader title={listTitle(list.owner_name)} meta="Instrumentos guardados en Laria. Los precios y la disponibilidad son los de hoy." />
          {list.items.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.items.map((item) => (
                <SavedCard key={item.id} href={`/instrumentos/${item.slug}`} title={item.title} imageUrl={item.image_url} price={item.price_pen} meta={item.note ? <p className="t-meta"><span className="font-semibold text-ink">Nota:</span> {item.note}</p> : null}>
                  <FavoriteButton listingId={item.id} />
                </SavedCard>
              ))}
            </ul>
          ) : (
            <EmptyState title="Esta lista está vacía por ahora" description="Los instrumentos que se vendan o dejen de publicarse no aparecen aquí." />
          )}
        </>
      )}
    </PageContainer>
  );
}
