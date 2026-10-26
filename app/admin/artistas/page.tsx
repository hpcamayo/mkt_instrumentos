import Link from "next/link";
import { AdminArtistForm, AdminArtistRevoke, type AdminArtist } from "@/components/discovery/admin-discovery-rows";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Tag } from "@/components/ui/tag";
import { requireAdmin } from "@/lib/admin-server";
import { ARTISTS_PATH } from "@/lib/discovery/makers";

export const metadata = { title: "Artistas verificados" };

// disc-05 Admin (docs/feature-ideas/discovery.md): verify an artist's identity on their account, edit what the
// landing shows, or withdraw the verification. All audited.
export default async function AdminArtistsPage() {
  const { supabase } = await requireAdmin("/admin/artistas");
  const { data, error } = await (supabase as unknown as { rpc: (name: string) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("get_admin_artists");
  const artists = Array.isArray(data) ? (data as AdminArtist[]) : [];
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Artistas verificados"
        meta={<p className="max-w-[68ch]">Verifica la identidad antes de guardar: una videollamada, un mensaje desde su cuenta oficial o su mánager. Laria verifica quién es, no cómo se usó el equipo.</p>}
      />
      <details className="rounded-panel border border-subtle bg-white p-4">
        <summary className="cursor-pointer t-section text-ink">Verificar un artista</summary>
        <div className="mt-4"><AdminArtistForm artist={null} /></div>
      </details>
      {error ? <Notice tone="danger">No pudimos cargar a los artistas. No asumiremos que no hay ninguno.</Notice> : null}
      <ul className="grid gap-4">
        {artists.map((artist) => (
          <li key={artist.user_id} className="rounded-panel border border-subtle bg-white p-4">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="t-section text-ink">{artist.display_name}</span>
                {artist.revoked_at ? <Tag tone="warning">Verificación retirada</Tag> : <Tag tone="accent">Verificado</Tag>}
                <span className="t-meta">{artist.email}</span>
              </summary>
              <p className="mt-2 t-meta"><Link href={`${ARTISTS_PATH}#${artist.slug}`} className="link">{`${ARTISTS_PATH}#${artist.slug}`}</Link></p>
              <div className="mt-4 grid gap-5">
                <AdminArtistForm artist={artist} />
                {artist.revoked_at ? null : <AdminArtistRevoke userId={artist.user_id} />}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
